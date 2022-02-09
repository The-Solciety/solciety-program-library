use std::cell::RefMut;
use std::convert::TryInto;
use std::ops::DerefMut;

use anchor_lang::__private::bytemuck;
use anchor_lang::{prelude::*, ZeroCopy};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use arrayref::array_ref;

#[cfg(test)]
use quickcheck_macros::quickcheck;

declare_id!("FqNuLBJt753qBon7cFWxknyGwKYFY8WZ8xoYN5ynXCBx");

pub const MIN_LOCK_DURATION_DAYS: u64 = 1; // 1 day
pub const MAX_LOCK_DURATION_DAYS: u64 = 365 / 2; // 6 months

pub const MAX_DURATION_TO_EMIT_REWARDS_DAYS: u64 = 4 * 365 + 1; // 4 years

pub const REWARD_TOKEN_DECIMALS: u8 = 9;
pub const SUBUNITS_PER_REWARD_TOKEN: u64 = 1_000_000_000;

#[error_code]
pub enum ErrorCode {
    #[msg("Unexpected reward token mint ID")]
    UnexpectedRewardTokenMintId,
    #[msg("Unexpected reward token mint decimals")]
    UnexpectedRewardTokenMintDecimals,
    #[msg("Unexpected mint ID specified in metadata account")]
    MetadataMintMismatch,
    #[msg("Expected metadata account to specify creators")]
    MetadataHasNoCreators,
    #[msg("Expected creator specified in the metadata account to be verified")]
    MetadataCreatorUnverified,
    #[msg("Unexpected creator specified in metadata account")]
    UnexpectedMetadataCreator,
    #[msg("Staker ID mismatches user ID")]
    StakerIdMismatch,
    #[msg("Lock duration specified by user is too small")]
    LockDurationTooSmall,
    #[msg("Lock duration specified by user exceeds max possible lock duration")]
    MaxPossibleLockDurationExceeded,
    #[msg("The period which the asset has been specified to be lock for has not yet elapsed")]
    NotYetUnlockable,
}

#[program]
pub mod solciety_staking_pool {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        require!(
            ctx.accounts.reward_token_mint.decimals == REWARD_TOKEN_DECIMALS,
            UnexpectedRewardTokenMintDecimals
        );

        let clock = Clock::get()?;

        let state = &mut ctx.accounts.state.load_init()?;
        state.admin_id = ctx.accounts.admin.key();
        state.reward_token_mint_id = ctx.accounts.reward_token_mint.key();
        state.deployed_at = clock.unix_timestamp;
        state.last_updated_at = clock.unix_timestamp;
        state.total_num_locked_nfts = 0;
        state.venft_supply = [0u64; MAX_DURATION_TO_EMIT_REWARDS_DAYS as usize];

        (*ctx.accounts.authority).state_id = ctx.accounts.state.key();

        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, lock_duration_in_days: u64) -> Result<()> {
        let clock = Clock::get()?;

        assert_lockable_nft(ctx.accounts.nft_mint.key(), &ctx.accounts.nft_metadata)?;

        let state = &mut ctx.accounts.state.load_mut()?;
        let staker = &mut match load_maybe_init_mut(&ctx.accounts.staker)? {
            AccountLoaderStatus::Initialized(staker) => {
                require!(
                    ctx.accounts.user.key() == staker.staker_id,
                    StakerIdMismatch,
                );
                staker
            }
            AccountLoaderStatus::Uninitialized(mut staker) => {
                staker.staker_id = ctx.accounts.user.key();
                staker.venft_balance = [0u64; (MAX_LOCK_DURATION_DAYS + 1) as usize];
                staker.num_locked_nfts = 0;
                staker.num_rewards_claimable = 0;
                staker.last_updated_at = clock.unix_timestamp;
                staker.last_claimed_at = 0;
                staker
            }
        };

        let locked_nft = &mut ctx.accounts.locked_nft.load_init()?;
        locked_nft.staker_id = ctx.accounts.user.key();
        locked_nft.mint_id = ctx.accounts.nft_mint.key();
        locked_nft.locked_at = clock.unix_timestamp;
        locked_nft.lock_duration_in_days = lock_duration_in_days;

        state.update(clock.unix_timestamp);
        staker.update(&state, clock.unix_timestamp);

        staker.stake_nft(state);
        staker.mint_venfts(state, clock.unix_timestamp, lock_duration_in_days)?;

        drop(state);
        drop(staker);

        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.nft.to_account_info(),
                    to: ctx.accounts.nft_escrow.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            1,
        )?;

        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>, authority_bump: u8) -> Result<()> {
        let clock = Clock::get()?;

        let state = &mut ctx.accounts.state.load_mut()?;
        require!(
            ctx.accounts.reward_token_mint.key() == state.reward_token_mint_id,
            UnexpectedRewardTokenMintId
        );
        let staker = &mut ctx.accounts.staker.load_mut()?;
        require!(
            ctx.accounts.user.key() == staker.staker_id,
            StakerIdMismatch
        );

        state.update(clock.unix_timestamp);
        staker.update(state, clock.unix_timestamp);

        let num_tokens_rewarded = staker.claim_rewards(clock.unix_timestamp);

        drop(state);
        drop(staker);

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.reward_token_treasury.to_account_info(),
                    to: ctx.accounts.reward_token.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
                &[&[b"authority", &[authority_bump]]],
            ),
            num_tokens_rewarded.saturating_mul(SUBUNITS_PER_REWARD_TOKEN),
        )?;

        Ok(())
    }

    pub fn extend(ctx: Context<Extend>, lock_duration_in_days: u64) -> Result<()> {
        let clock = Clock::get()?;
        let state = &mut ctx.accounts.state.load_mut()?;
        let staker = &mut ctx.accounts.staker.load_mut()?;
        require!(
            ctx.accounts.user.key() == staker.staker_id,
            StakerIdMismatch
        );
        let locked_nft = &mut ctx.accounts.locked_nft.load_mut()?;
        let max_num_days_may_be_extended =
            locked_nft.max_num_days_may_be_extended(clock.unix_timestamp);
        require!(
            lock_duration_in_days >= MIN_LOCK_DURATION_DAYS,
            LockDurationTooSmall
        );
        require!(
            lock_duration_in_days <= max_num_days_may_be_extended,
            MaxPossibleLockDurationExceeded
        );

        state.update(clock.unix_timestamp);
        staker.update(state, clock.unix_timestamp);

        staker.mint_venfts(state, clock.unix_timestamp, lock_duration_in_days)?;
        locked_nft.extend_lock_duration(clock.unix_timestamp, lock_duration_in_days);

        drop(state);
        drop(staker);
        drop(locked_nft);

        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>, authority_bump: u8) -> Result<()> {
        let clock = Clock::get()?;

        let locked_nft = ctx.accounts.locked_nft.load()?;
        let state = &mut ctx.accounts.state.load_mut()?;
        let staker = &mut ctx.accounts.staker.load_mut()?;
        require!(
            ctx.accounts.user.key() == staker.staker_id,
            StakerIdMismatch,
        );

        require!(
            locked_nft.may_be_unlocked(
                ctx.accounts.user.key(),
                ctx.accounts.nft_mint.key(),
                clock.unix_timestamp,
            ),
            NotYetUnlockable
        );

        state.update(clock.unix_timestamp);
        staker.update(state, clock.unix_timestamp);

        state.total_num_locked_nfts = state.total_num_locked_nfts.saturating_sub(1);
        staker.num_locked_nfts = staker.num_locked_nfts.saturating_sub(1);

        drop(state);
        drop(staker);

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.nft_escrow.to_account_info(),
                    to: ctx.accounts.nft.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
                &[&[b"authority", &[authority_bump]]],
            ),
            1,
        )?;

        anchor_spl::token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: ctx.accounts.nft_escrow.to_account_info(),
                destination: ctx.accounts.user.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
            &[&[b"authority", &[authority_bump]]],
        ))?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(zero)]
    pub state: AccountLoader<'info, State>,
    #[account(init, payer = admin, seeds = [b"authority"], bump)]
    pub authority: Account<'info, Authority>,
    pub reward_token_mint: Box<Account<'info, Mint>>,
    #[account(init, payer = admin, seeds = [b"treasury"], bump, token::mint = reward_token_mint, token::authority = authority)]
    pub reward_token_treasury: Box<Account<'info, TokenAccount>>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, constraint = authority.state_id == state.key())]
    pub state: AccountLoader<'info, State>,
    #[account(mut, seeds = [b"authority"], bump)]
    pub authority: Account<'info, Authority>,
    pub nft_mint: Box<Account<'info, Mint>>,
    #[account(owner = mpl_token_metadata::id(), seeds = [mpl_token_metadata::state::PREFIX.as_bytes(), mpl_token_metadata::id().as_ref(), nft_mint.key().as_ref()], bump, seeds::program = mpl_token_metadata::id())]
    pub nft_metadata: AccountInfo<'info>,
    #[account(mut, associated_token::mint = nft_mint, associated_token::authority = user)]
    pub nft: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = user, seeds = [b"escrow", nft_mint.key().as_ref()], bump, token::mint = nft_mint, token::authority = authority)]
    pub nft_escrow: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = user, seeds = [b"staker", user.key().as_ref()], bump)]
    pub staker: AccountLoader<'info, Staker>,
    #[account(init, payer = user, seeds = [b"locked_nft", nft_mint.key().as_ref()], bump)]
    pub locked_nft: AccountLoader<'info, LockedNft>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(authority_bump: u8)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, constraint = authority.state_id == state.key())]
    pub state: AccountLoader<'info, State>,
    #[account(seeds = [b"authority"], bump = authority_bump)]
    pub authority: Account<'info, Authority>,
    #[account(mut, seeds = [b"staker", user.key().as_ref()], bump)]
    pub staker: AccountLoader<'info, Staker>,
    pub reward_token_mint: Box<Account<'info, Mint>>,
    #[account(init_if_needed, payer = user, associated_token::mint = reward_token_mint, associated_token::authority = user)]
    pub reward_token: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [b"treasury"], bump)]
    pub reward_token_treasury: Box<Account<'info, TokenAccount>>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(authority_bump: u8)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, constraint = authority.state_id == state.key())]
    pub state: AccountLoader<'info, State>,
    #[account(seeds = [b"authority"], bump = authority_bump)]
    pub authority: Account<'info, Authority>,
    pub nft_mint: Box<Account<'info, Mint>>,
    #[account(mut, associated_token::mint = nft_mint, associated_token::authority = user)]
    pub nft: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [b"escrow", nft_mint.key().as_ref()], bump)]
    pub nft_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [b"staker", user.key().as_ref()], bump)]
    pub staker: AccountLoader<'info, Staker>,
    #[account(mut, close = user, seeds = [b"locked_nft", nft_mint.key().as_ref()], bump)]
    pub locked_nft: AccountLoader<'info, LockedNft>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Extend<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, constraint = authority.state_id == state.key())]
    pub state: AccountLoader<'info, State>,
    #[account(seeds = [b"authority"], bump)]
    pub authority: Account<'info, Authority>,
    pub nft_mint: Box<Account<'info, Mint>>,
    #[account(mut, seeds = [b"staker", user.key().as_ref()], bump)]
    pub staker: AccountLoader<'info, Staker>,
    #[account(mut, seeds = [b"locked_nft", nft_mint.key().as_ref()], bump)]
    pub locked_nft: AccountLoader<'info, LockedNft>,
}

pub fn assert_lockable_nft(mint_id: Pubkey, metadata_account: &AccountInfo) -> Result<()> {
    use std::str::FromStr;

    let metadata = mpl_token_metadata::state::Metadata::from_account_info(metadata_account)?;

    require!(metadata.mint == mint_id, MetadataMintMismatch,);

    match metadata.data.creators {
        Some(creators) => {
            let creator = match creators.iter().next() {
                Some(creator) => creator,
                None => return Err(ErrorCode::MetadataHasNoCreators.into()),
            };

            require!(
                creator.address
                    == Pubkey::from_str("7QAB4Y3xGKtyV71qfasjbk1qXkZTTuEuR8WjsM2PijW5").unwrap(),
                UnexpectedMetadataCreator
            );

            // TODO: Uncomment metadata creator verification constraint on mainnet.
            require!(true || creator.verified, MetadataCreatorUnverified);
        }
        None => return Err(ErrorCode::MetadataHasNoCreators.into()),
    };

    Ok(())
}

#[account]
#[derive(Default)]
pub struct Authority {
    pub state_id: Pubkey,
}

#[account(zero_copy)]
#[derive(Default, Debug)]
pub struct LockedNft {
    pub staker_id: Pubkey,
    pub mint_id: Pubkey,

    pub locked_at: i64,
    pub lock_duration_in_days: u64,
}

impl LockedNft {
    pub fn max_num_days_may_be_extended(&self, current_time: i64) -> u64 {
        let days_elapsed_since_locked = days_between_timestamps(self.locked_at, current_time);
        let days_left_before_unlocked = self
            .lock_duration_in_days
            .saturating_sub(days_elapsed_since_locked);
        MAX_LOCK_DURATION_DAYS.saturating_sub(days_left_before_unlocked)
    }

    pub fn extend_lock_duration(&mut self, current_time: i64, lock_duration_in_days: u64) {
        let days_elapsed_since_locked = days_between_timestamps(self.locked_at, current_time);
        let days_left_before_unlocked = self
            .lock_duration_in_days
            .saturating_sub(days_elapsed_since_locked);
        self.locked_at = current_time;
        self.lock_duration_in_days =
            days_left_before_unlocked.saturating_add(lock_duration_in_days);
    }

    pub fn may_be_unlocked(&self, user_id: Pubkey, mint_id: Pubkey, current_time: i64) -> bool {
        self.staker_id == user_id
            && self.mint_id == mint_id
            && current_time
                > self.locked_at.saturating_add(
                    self.lock_duration_in_days
                        .saturating_mul(24 * 60 * 60)
                        .try_into()
                        .unwrap_or(i64::MAX),
                )
    }
}

#[account(zero_copy)]
#[derive(Debug)]
pub struct State {
    pub admin_id: Pubkey,

    pub reward_token_mint_id: Pubkey,

    pub deployed_at: i64,
    pub last_updated_at: i64,

    pub total_num_locked_nfts: u64,

    /// Index 0 starts on the first day after the program is deployed.
    pub venft_supply: [u64; 1461],
}

impl Default for State {
    fn default() -> Self {
        Self {
            admin_id: Default::default(),

            reward_token_mint_id: Default::default(),

            deployed_at: Default::default(),
            last_updated_at: Default::default(),

            total_num_locked_nfts: Default::default(),

            venft_supply: [0u64; MAX_DURATION_TO_EMIT_REWARDS_DAYS as usize],
        }
    }
}

impl State {
    pub fn update(&mut self, current_time: i64) {
        self.last_updated_at = current_time;
    }
}

#[account(zero_copy)]
#[derive(Debug)]
pub struct Staker {
    pub staker_id: Pubkey,

    /// Index 0 starts from the last day the staker was last updated.
    pub venft_balance: [u64; 183],

    pub num_locked_nfts: u64,
    pub num_rewards_claimable: u64,

    pub last_updated_at: i64,
    pub last_claimed_at: i64,
}

impl Default for Staker {
    fn default() -> Self {
        Self {
            staker_id: Default::default(),
            venft_balance: [0u64; (MAX_LOCK_DURATION_DAYS + 1) as usize],
            num_locked_nfts: Default::default(),
            num_rewards_claimable: Default::default(),
            last_updated_at: Default::default(),
            last_claimed_at: Default::default(),
        }
    }
}

impl Staker {
    pub fn update(&mut self, state: &State, current_time: i64) {
        let days_elapsed_since_last_updated: usize =
            days_between_timestamps(self.last_updated_at, current_time)
                .try_into()
                .unwrap_or(usize::MAX);

        if days_elapsed_since_last_updated < 1 {
            return;
        }

        let days_elapsed_since_program_deployed: usize =
            days_between_timestamps(state.deployed_at, self.last_updated_at)
                .try_into()
                .unwrap_or(usize::MAX);
        let days_left_before_reward_emissions_end: usize = (MAX_DURATION_TO_EMIT_REWARDS_DAYS
            as usize)
            .saturating_sub(days_elapsed_since_program_deployed);

        let rollover_count: usize = days_elapsed_since_last_updated
            .min(MAX_LOCK_DURATION_DAYS as usize)
            .min(days_left_before_reward_emissions_end);

        let last_updated_at: i64 = std::mem::replace(&mut self.last_updated_at, current_time);
        let day_offset: usize = days_between_timestamps(state.deployed_at, last_updated_at)
            .try_into()
            .unwrap_or(usize::MAX);

        // Rollover the amount of days that has elapsed since the last time the staker
        // interacted with the program. Update the amount of rewards claimable by the
        // staker.

        for day in 0..rollover_count {
            let reward_emitted: u64 = REWARD_SCHEDULE_IN_DAYS[day_offset + day];
            let staker_venft_balance: u64 = self.venft_balance[day];
            let total_venft_supply: u64 = match state.venft_supply[day_offset + day] {
                0 => continue,
                total_venft_supply => total_venft_supply,
            };

            self.num_rewards_claimable = self.num_rewards_claimable.saturating_add(
                reward_emitted.saturating_mul(staker_venft_balance) / total_venft_supply,
            );
        }

        self.venft_balance[0..rollover_count].fill(0);
        self.venft_balance.rotate_left(rollover_count);
    }

    /// Empty the number of reward tokens claimable by the staker, update the timestamp denoting the
    /// the last time the staker claimed rewards, and return the number of reward tokens claimable
    /// by the staker.
    pub fn claim_rewards(&mut self, current_time: i64) -> u64 {
        let num_tokens_rewarded = std::mem::replace(&mut self.num_rewards_claimable, 0);
        self.last_claimed_at = current_time;
        num_tokens_rewarded
    }

    pub fn stake_nft(&mut self, state: &mut State) {
        self.num_locked_nfts = self.num_locked_nfts.saturating_add(1);
        state.total_num_locked_nfts = state.total_num_locked_nfts.saturating_add(1);
    }

    /// veNFT's are minted to the staker in exchange for the escrow of a NFT. The veNFT's will only
    /// be considered to be part of the total veNFT supply starting from the next day.
    pub fn mint_venfts(
        &mut self,
        state: &mut State,
        current_time: i64,
        lock_duration_in_days: u64,
    ) -> Result<()> {
        // First, we assert that the lock duration in days provided is acceptable.

        let days_elapsed_since_program_deployed: u64 =
            days_between_timestamps(state.deployed_at, current_time);
        let days_left_before_reward_emissions_end: u64 =
            MAX_DURATION_TO_EMIT_REWARDS_DAYS.saturating_sub(days_elapsed_since_program_deployed);

        let min_lock_duration_allowed = MIN_LOCK_DURATION_DAYS;
        let max_lock_duration_allowed =
            MAX_LOCK_DURATION_DAYS.min(days_left_before_reward_emissions_end);

        require!(
            (min_lock_duration_allowed..=max_lock_duration_allowed)
                .contains(&lock_duration_in_days),
            MaxPossibleLockDurationExceeded
        );

        // Second, we mint veNFT's to the staker over the lock duration in days specified. All
        // veNFT's gets accounted for in the total veNFT supply as well.

        let day_offset: usize = days_elapsed_since_program_deployed
            .try_into()
            .unwrap_or(usize::MAX);

        let mut mint_amount = lock_duration_in_days.saturating_mul(1_000_000_000);
        let mut balance = self.venft_balance[0..].iter_mut();
        let mut supply = state.venft_supply[day_offset..].iter_mut();

        const SECONDS_PER_DAY: u64 = 24 * 60 * 60;

        let seconds_left_before_next_day: u64 = SECONDS_PER_DAY
            .saturating_sub(current_time.try_into().unwrap_or(u64::MAX) % SECONDS_PER_DAY);

        let first_day_decay_rate =
            1_000_000_000u64.saturating_mul(seconds_left_before_next_day) / SECONDS_PER_DAY;

        if first_day_decay_rate > 0 {
            if let Some(balance) = balance.next() {
                *balance = (*balance).saturating_add(mint_amount);
            }
            if let Some(supply) = supply.next() {
                *supply = (*supply).saturating_add(mint_amount);
            }
            mint_amount = mint_amount.saturating_sub(first_day_decay_rate);
        }

        for _ in 0..lock_duration_in_days {
            if let Some(balance) = balance.next() {
                *balance = (*balance).saturating_add(mint_amount);
            }
            if let Some(supply) = supply.next() {
                *supply = (*supply).saturating_add(mint_amount);
            }
            mint_amount = mint_amount.saturating_sub(1_000_000_000u64);
        }

        if mint_amount > 0 {
            if let Some(balance) = balance.next() {
                *balance = (*balance).saturating_add(mint_amount);
            }
            if let Some(supply) = supply.next() {
                *supply = (*supply).saturating_add(mint_amount);
            }
        }

        Ok(())
    }
}

pub fn days_between_timestamps(start: i64, end: i64) -> u64 {
    if end <= start {
        return 0;
    }
    end.saturating_sub(start)
        .checked_div(60 * 60 * 24)
        .unwrap_or(0i64)
        .try_into()
        .unwrap_or(0u64)
}

#[cfg(test)]
#[test]
pub fn test_staker_lock_duration_edge_cases() {
    let mut state: State = Default::default();
    let mut staker: Staker = Default::default();

    // Lower bound checks.

    assert!(staker
        .mint_venfts(&mut state, 0 * 24 * 60 * 60, MIN_LOCK_DURATION_DAYS - 1)
        .is_err());

    assert!(staker
        .mint_venfts(&mut state, 0 * 24 * 60 * 60, MAX_LOCK_DURATION_DAYS + 1)
        .is_err());

    assert!(staker
        .mint_venfts(
            &mut state,
            MAX_DURATION_TO_EMIT_REWARDS_DAYS as i64 * 24 * 60 * 60,
            1
        )
        .is_err());

    // Upper bound checks.

    assert!(staker
        .mint_venfts(
            &mut state,
            (MAX_DURATION_TO_EMIT_REWARDS_DAYS - MAX_LOCK_DURATION_DAYS + 1) as i64 * 24 * 60 * 60,
            MAX_LOCK_DURATION_DAYS
        )
        .is_err());
}

#[cfg(test)]
#[test]
pub fn test_staker_stakes_nfts() {
    let mut state: State = Default::default();
    let mut staker: Staker = Default::default();

    state.update(0 * 24 * 60 * 60);
    staker.update(&state, 0 * 24 * 60 * 60);
    staker.stake_nft(&mut state);

    staker
        .mint_venfts(&mut state, 0 * 24 * 60 * 60, MAX_LOCK_DURATION_DAYS)
        .unwrap();

    assert_eq!(
        &state.venft_supply[0..5],
        &[
            182000000000,
            181000000000,
            180000000000,
            179000000000,
            178000000000,
        ]
    );

    assert_eq!(
        &staker.venft_balance[0..5],
        &[
            182000000000,
            181000000000,
            180000000000,
            179000000000,
            178000000000,
        ]
    );

    state.update(5 * 24 * 60 * 60);
    staker.update(&state, 5 * 24 * 60 * 60);

    assert_eq!(state.last_updated_at, 5 * 24 * 60 * 60);
    assert_eq!(staker.last_updated_at, 5 * 24 * 60 * 60);

    assert_eq!(
        &state.venft_supply[0..5],
        &[
            182000000000,
            181000000000,
            180000000000,
            179000000000,
            178000000000,
        ]
    );

    assert_eq!(
        &staker.venft_balance[0..5],
        &[
            177000000000,
            176000000000,
            175000000000,
            174000000000,
            173000000000,
        ]
    );

    assert_eq!(
        staker.num_rewards_claimable,
        REWARD_SCHEDULE_IN_DAYS[0..5].iter().sum()
    );
}

#[cfg(test)]
#[test]
pub fn test_staker_stakes_nfts_at_end() {
    let mut state: State = Default::default();
    let mut staker: Staker = Default::default();

    state.update(1457 * 24 * 60 * 60);
    staker.update(&state, 1457 * 24 * 60 * 60);
    staker.stake_nft(&mut state);
    staker
        .mint_venfts(&mut state, 1457 * 24 * 60 * 60, 4)
        .unwrap();

    assert_eq!(
        &state.venft_supply[1457..],
        &[4000000000, 3000000000, 2000000000, 1000000000]
    );

    assert_eq!(
        &staker.venft_balance[0..4],
        &[4000000000, 3000000000, 2000000000, 1000000000]
    );

    state.update(1600 * 24 * 60 * 60);
    staker.update(&state, 1600 * 24 * 60 * 60);

    assert_eq!(state.last_updated_at, 1600 * 24 * 60 * 60);
    assert_eq!(staker.last_updated_at, 1600 * 24 * 60 * 60);

    assert_eq!(
        &state.venft_supply[1457..],
        &[4000000000, 3000000000, 2000000000, 1000000000]
    );

    assert!(staker.venft_balance.iter().all(|balance| *balance == 0));

    assert_eq!(
        staker.num_rewards_claimable,
        REWARD_SCHEDULE_IN_DAYS[REWARD_SCHEDULE_IN_DAYS.len() - 4..]
            .iter()
            .sum()
    );
}

#[cfg(test)]
#[test]
pub fn test_reward_schedule_sane() {
    assert_eq!(REWARD_SCHEDULE_IN_DAYS.iter().sum::<u64>(), 700_000_000);
}

#[cfg(test)]
#[test]
pub fn test_days_between_timestamps() {
    for days in 1..MAX_DURATION_TO_EMIT_REWARDS_DAYS as i64 {
        assert_eq!(days_between_timestamps(0, days * 24 * 60 * 60), days as u64);
    }
}

#[cfg(test)]
#[quickcheck]
#[allow(unused_comparisons)]
pub fn test_check_locked_nft_max_num_days_may_be_extended(
    lock_duration_in_days: u64,
    current_time: u32,
) {
    let locked_nft = LockedNft {
        locked_at: current_time as i64,
        lock_duration_in_days: MIN_LOCK_DURATION_DAYS
            + lock_duration_in_days % (MAX_LOCK_DURATION_DAYS - MIN_LOCK_DURATION_DAYS),
        ..Default::default()
    };

    locked_nft.max_num_days_may_be_extended(current_time as i64);
}

#[cfg(test)]
#[quickcheck]
#[allow(unused_comparisons)]
pub fn test_check_locked_nft_extend_lock_duration(
    days_locked_so_far: u64,
    lock_duration_in_days: u64,
    locked_at: u32,
    num_days_to_extend_by: u64,
) {
    let lock_duration_in_days = MIN_LOCK_DURATION_DAYS
        + lock_duration_in_days % (MAX_LOCK_DURATION_DAYS - MIN_LOCK_DURATION_DAYS);

    let mut locked_nft = LockedNft {
        locked_at: locked_at as i64,
        lock_duration_in_days,
        ..Default::default()
    };

    let current_time = locked_at as i64 + (days_locked_so_far % lock_duration_in_days) as i64;
    let max_num_days_extendable = locked_nft.max_num_days_may_be_extended(current_time);

    if max_num_days_extendable > 0 {
        locked_nft.extend_lock_duration(
            current_time,
            num_days_to_extend_by % max_num_days_extendable,
        );

        assert!(
            (MIN_LOCK_DURATION_DAYS..=MAX_LOCK_DURATION_DAYS)
                .contains(&locked_nft.lock_duration_in_days),
            "lock duration is {}",
            locked_nft.lock_duration_in_days
        );
    }
}

#[cfg(test)]
#[quickcheck]
#[allow(unused_comparisons)]
pub fn test_check_days_between_timestamps(start: i64, end: i64) -> bool {
    if end <= start {
        days_between_timestamps(start, end) == 0
    } else {
        days_between_timestamps(start, end) >= 0
    }
}

enum AccountLoaderStatus<'info, T: ZeroCopy + Owner> {
    Uninitialized(RefMut<'info, T>),
    Initialized(RefMut<'info, T>),
}

fn load_maybe_init_mut<'a, T: ZeroCopy + Owner>(
    loader: &'a AccountLoader<T>,
) -> Result<AccountLoaderStatus<'a, T>> {
    if !loader.as_ref().is_writable {
        return Err(anchor_lang::error::ErrorCode::AccountNotMutable.into());
    }

    let data = loader.as_ref().try_borrow_mut_data()?;
    if data.len() < 8 {
        return Err(anchor_lang::error::ErrorCode::AccountDiscriminatorNotFound.into());
    }

    let discriminator = array_ref![data, 0, 8];

    if *discriminator == [0u8; 8] {
        return Ok(AccountLoaderStatus::Uninitialized(RefMut::map(
            data,
            |data| bytemuck::from_bytes_mut(&mut data.deref_mut()[8..]),
        )));
    }

    if *discriminator == T::discriminator() {
        return Ok(AccountLoaderStatus::Initialized(RefMut::map(
            data,
            |data| bytemuck::from_bytes_mut(&mut data.deref_mut()[8..]),
        )));
    }

    Err(anchor_lang::error::ErrorCode::AccountDiscriminatorMismatch.into())
}

pub const REWARD_SCHEDULE_IN_DAYS: [u64; MAX_DURATION_TO_EMIT_REWARDS_DAYS as usize] = [
    958575, 957919, 957262, 956605, 955948, 955292, 954635, 953978, 953321, 952664, 952008, 951351,
    950694, 950037, 949381, 948724, 948067, 947410, 946753, 946097, 945440, 944783, 944126, 943469,
    942813, 942156, 941499, 940842, 940186, 939529, 938872, 938215, 937558, 936902, 936245, 935588,
    934931, 934275, 933618, 932961, 932304, 931647, 930991, 930334, 929677, 929020, 928363, 927707,
    927050, 926393, 925736, 925080, 924423, 923766, 923109, 922452, 921796, 921139, 920482, 919825,
    919168, 918512, 917855, 917198, 916541, 915885, 915228, 914571, 913914, 913257, 912601, 911944,
    911287, 910630, 909974, 909317, 908660, 908003, 907346, 906690, 906033, 905376, 904719, 904062,
    903406, 902749, 902092, 901435, 900779, 900122, 899465, 898808, 898151, 897495, 896838, 896181,
    895524, 894867, 894211, 893554, 892897, 892240, 891584, 890927, 890270, 889613, 888956, 888300,
    887643, 886986, 886329, 885673, 885016, 884359, 883702, 883045, 882389, 881732, 881075, 880418,
    879761, 879105, 878448, 877791, 877134, 876478, 875821, 875164, 874507, 873850, 873194, 872537,
    871880, 871223, 870566, 869910, 869253, 868596, 867939, 867283, 866626, 865969, 865312, 864655,
    863999, 863342, 862685, 862028, 861372, 860715, 860058, 859401, 858744, 858088, 857431, 856774,
    856117, 855460, 854804, 854147, 853490, 852833, 852177, 851520, 850863, 850206, 849549, 848893,
    848236, 847579, 846922, 846265, 845609, 844952, 844295, 843638, 842982, 842325, 841668, 841011,
    840354, 839698, 839041, 838384, 837727, 837071, 836414, 835757, 835100, 834443, 833787, 833130,
    832473, 831816, 831159, 830503, 829846, 829189, 828532, 827876, 827219, 826562, 825905, 825248,
    824592, 823935, 823278, 822621, 821965, 821308, 820651, 819994, 819337, 818681, 818024, 817367,
    816710, 816053, 815397, 814740, 814083, 813426, 812770, 812113, 811456, 810799, 810142, 809486,
    808829, 808172, 807515, 806858, 806202, 805545, 804888, 804231, 803575, 802918, 802261, 801604,
    800947, 800291, 799634, 798977, 798320, 797664, 797007, 796350, 795693, 795036, 794380, 793723,
    793066, 792409, 791752, 791096, 790439, 789782, 789125, 788469, 787812, 787155, 786498, 785841,
    785185, 784528, 783871, 783214, 782557, 781901, 781244, 780587, 779930, 779274, 778617, 777960,
    777303, 776646, 775990, 775333, 774676, 774019, 773363, 772706, 772049, 771392, 770735, 770079,
    769422, 768765, 768108, 767451, 766795, 766138, 765481, 764824, 764168, 763511, 762854, 762197,
    761540, 760884, 760227, 759570, 758913, 758256, 757600, 756943, 756286, 755629, 754973, 754316,
    753659, 753002, 752345, 751689, 751032, 750375, 749718, 749062, 748405, 747748, 747091, 746434,
    745778, 745121, 744464, 743807, 743150, 742494, 741837, 741180, 740523, 739867, 739210, 738553,
    737896, 737239, 736583, 735926, 735269, 734612, 733955, 733299, 732642, 731985, 731328, 730672,
    730015, 729358, 728701, 728044, 727388, 726731, 726074, 725417, 724761, 724104, 723447, 722790,
    722133, 721477, 720820, 720163, 719506, 718849, 718193, 717536, 716879, 716222, 715566, 714909,
    714252, 713595, 712938, 712282, 711625, 710968, 710311, 709655, 708998, 708341, 707684, 707027,
    706371, 705714, 705057, 704400, 703743, 703087, 702430, 701773, 701116, 700460, 699803, 699146,
    698489, 697832, 697176, 696519, 695862, 695205, 694548, 693892, 693235, 692578, 691921, 691265,
    690608, 689951, 689294, 688637, 687981, 687324, 686667, 686010, 685354, 684697, 684040, 683383,
    682726, 682070, 681413, 680756, 680099, 679442, 678786, 678129, 677472, 676815, 676159, 675502,
    674845, 674188, 673531, 672875, 672218, 671561, 670904, 670247, 669591, 668934, 668277, 667620,
    666964, 666307, 665650, 664993, 664336, 663680, 663023, 662366, 661709, 661053, 660396, 659739,
    659082, 658425, 657769, 657112, 656455, 655798, 655141, 654485, 653828, 653171, 652514, 651858,
    651201, 650544, 649887, 649230, 648574, 647917, 647260, 646603, 645946, 645290, 644633, 643976,
    643319, 642663, 642006, 641349, 640692, 640035, 639379, 638722, 638065, 637408, 636752, 636095,
    635438, 634781, 634124, 633468, 632811, 632154, 631497, 630840, 630184, 629527, 628870, 628213,
    627557, 626900, 626243, 625586, 624929, 624273, 623616, 622959, 622302, 621645, 620989, 620332,
    619675, 619018, 618362, 617705, 617048, 616391, 615734, 615078, 614421, 613764, 613107, 612451,
    611794, 611137, 610480, 609823, 609167, 608510, 607853, 607196, 606539, 605883, 605226, 604569,
    603912, 603256, 602599, 601942, 601285, 600628, 599972, 599315, 598658, 598001, 597344, 596688,
    596031, 595374, 594717, 594061, 593404, 592747, 592090, 591433, 590777, 590120, 589463, 588806,
    588150, 587493, 586836, 586179, 585522, 584866, 584209, 583552, 582895, 582238, 581582, 580925,
    580268, 579611, 578955, 578298, 577641, 576984, 576327, 575671, 575014, 574357, 573700, 573044,
    572387, 571730, 571073, 570416, 569760, 569103, 568446, 567789, 567132, 566476, 565819, 565162,
    564505, 563849, 563192, 562535, 561878, 561221, 560565, 559908, 559251, 558594, 557937, 557281,
    556624, 555967, 555310, 554654, 553997, 553340, 552683, 552026, 551370, 550713, 550056, 549399,
    548743, 548086, 547429, 546772, 546115, 545459, 544802, 544145, 543488, 542831, 542175, 541518,
    540861, 540204, 539548, 538891, 538234, 537577, 536920, 536264, 535607, 534950, 534293, 533636,
    532980, 532323, 531666, 531009, 530353, 529696, 529039, 528382, 527725, 527069, 526412, 525755,
    525098, 524442, 523785, 523128, 522471, 521814, 521158, 520501, 519844, 519187, 518530, 517874,
    517217, 516560, 515903, 515247, 514590, 513933, 513276, 512619, 511963, 511306, 510649, 509992,
    509335, 508679, 508022, 507365, 506708, 506052, 505395, 504738, 504081, 503424, 502768, 502111,
    501454, 500797, 500141, 499484, 498827, 498170, 497513, 496857, 496200, 495543, 494886, 494229,
    493573, 492916, 492259, 491602, 490946, 490289, 489632, 488975, 488318, 487662, 487005, 486348,
    485691, 485034, 484378, 483721, 483064, 482407, 481751, 481094, 480437, 479780, 479123, 478467,
    477810, 477153, 476496, 475840, 475183, 474526, 473869, 473212, 472556, 471899, 471242, 470585,
    469928, 469272, 468615, 467958, 467301, 466645, 465988, 465331, 464674, 464017, 463361, 462704,
    462047, 461390, 460734, 460077, 459420, 458763, 458106, 457450, 456793, 456136, 455479, 454822,
    454166, 453509, 452852, 452195, 451539, 450882, 450225, 449568, 448911, 448255, 447598, 446941,
    446284, 445627, 444971, 444314, 443657, 443000, 442344, 441687, 441030, 440373, 439716, 439060,
    438403, 437746, 437089, 436433, 435776, 435119, 434462, 433805, 433149, 432492, 431835, 431178,
    430521, 429865, 429208, 428551, 427894, 427238, 426581, 425924, 425267, 424610, 423954, 423297,
    422640, 421983, 421326, 420670, 420013, 419356, 418699, 418043, 417386, 416729, 416072, 415415,
    414759, 414102, 413445, 412788, 412132, 411475, 410818, 410161, 409504, 408848, 408191, 407534,
    406877, 406220, 405564, 404907, 404250, 403593, 402937, 402280, 401623, 400966, 400309, 399653,
    398996, 398339, 397682, 397025, 396369, 395712, 395055, 394398, 393742, 393085, 392428, 391771,
    391114, 390458, 389801, 389144, 388487, 387831, 387174, 386517, 385860, 385203, 384547, 383890,
    383233, 382576, 381919, 381263, 380606, 379949, 379292, 378636, 377979, 377322, 376665, 376008,
    375352, 374695, 374038, 373381, 372724, 372068, 371411, 370754, 370097, 369441, 368784, 368127,
    367470, 366813, 366157, 365500, 364843, 364186, 363530, 362873, 362216, 361559, 360902, 360246,
    359589, 358932, 358275, 357618, 356962, 356305, 355648, 354991, 354335, 353678, 353021, 352364,
    351707, 351051, 350394, 349737, 349080, 348424, 347767, 347110, 346453, 345796, 345140, 344483,
    343826, 343169, 342512, 341856, 341199, 340542, 339885, 339229, 338572, 337915, 337258, 336601,
    335945, 335288, 334631, 333974, 333317, 332661, 332004, 331347, 330690, 330034, 329377, 328720,
    328063, 327406, 326750, 326093, 325436, 324779, 324123, 323466, 322809, 322152, 321495, 320839,
    320182, 319525, 318868, 318211, 317555, 316898, 316241, 315584, 314928, 314271, 313614, 312957,
    312300, 311644, 310987, 310330, 309673, 309016, 308360, 307703, 307046, 306389, 305733, 305076,
    304419, 303762, 303105, 302449, 301792, 301135, 300478, 299822, 299165, 298508, 297851, 297194,
    296538, 295881, 295224, 294567, 293910, 293254, 292597, 291940, 291283, 290627, 289970, 289313,
    288656, 287999, 287343, 286686, 286029, 285372, 284715, 284059, 283402, 282745, 282088, 281432,
    280775, 280118, 279461, 278804, 278148, 277491, 276834, 276177, 275521, 274864, 274207, 273550,
    272893, 272237, 271580, 270923, 270266, 269609, 268953, 268296, 267639, 266982, 266326, 265669,
    265012, 264355, 263698, 263042, 262385, 261728, 261071, 260414, 259758, 259101, 258444, 257787,
    257131, 256474, 255817, 255160, 254503, 253847, 253190, 252533, 251876, 251220, 250563, 249906,
    249249, 248592, 247936, 247279, 246622, 245965, 245308, 244652, 243995, 243338, 242681, 242025,
    241368, 240711, 240054, 239397, 238741, 238084, 237427, 236770, 236113, 235457, 234800, 234143,
    233486, 232830, 232173, 231516, 230859, 230202, 229546, 228889, 228232, 227575, 226919, 226262,
    225605, 224948, 224291, 223635, 222978, 222321, 221664, 221007, 220351, 219694, 219037, 218380,
    217724, 217067, 216410, 215753, 215096, 214440, 213783, 213126, 212469, 211813, 211156, 210499,
    209842, 209186, 208530, 207873, 207216, 206559, 205902, 205246, 204589, 203932, 203275, 202619,
    201962, 201305, 200648, 199991, 199335, 198678, 198021, 197364, 196707, 196051, 195394, 194737,
    194080, 193424, 192767, 192110, 191453, 190796, 190140, 189483, 188826, 188169, 187513, 186856,
    186199, 185542, 184885, 184229, 183572, 182915, 182258, 181601, 180945, 180288, 179631, 178974,
    178318, 177661, 177004, 176347, 175690, 175034, 174377, 173720, 173063, 172406, 171750, 171093,
    170436, 169779, 169123, 168466, 167809, 167152, 166495, 165839, 165182, 164525, 163868, 163212,
    162555, 161898, 161241, 160584, 159928, 159271, 158614, 157957, 157300, 156644, 155987, 155330,
    154673, 154017, 153360, 152703, 152046, 151389, 150733, 150076, 149419, 148762, 148105, 147449,
    146792, 146135, 145478, 144822, 144165, 143508, 142851, 142194, 141538, 140881, 140224, 139567,
    138911, 138254, 137597, 136940, 136283, 135627, 134970, 134313, 133656, 132999, 132343, 131686,
    131029, 130372, 129716, 129059, 128402, 127745, 127088, 126432, 125775, 125118, 124461, 123804,
    123148, 122491, 121834, 121177, 120521, 119864, 119207, 118550, 117893, 117237, 116580, 115923,
    115266, 114610, 113953, 113296, 112639, 111982, 111326, 110669, 110012, 109355, 108698, 108042,
    107385, 106728, 106071, 105415, 104758, 104101, 103444, 102787, 102131, 101474, 100817, 100160,
    99504, 98847, 98190, 97533, 96876, 96220, 95563, 94906, 94249, 93592, 92936, 92279, 91622,
    90965, 90309, 89652, 88995, 88338, 87681, 87025, 86368, 85711, 85054, 84397, 83741, 83084,
    82427, 81770, 81114, 80457, 79800, 79143, 78486, 77830, 77173, 76516, 75859, 75203, 74546,
    73889, 73232, 72575, 71919, 71262, 70605, 69948, 69291, 68635, 67978, 67321, 66664, 66008,
    65351, 64694, 64037, 63380, 62724, 62067, 61410, 60753, 60096, 59440, 58783, 58126, 57469,
    56813, 56156, 55499, 54842, 54185, 53529, 52872, 52215, 51558, 50902, 50245, 49588, 48931,
    48274, 47618, 46961, 46304, 45647, 44990, 44334, 43677, 43020, 42363, 41707, 41050, 40393,
    39736, 39079, 38423, 37766, 37109, 36452, 35795, 35139, 34482, 33825, 33168, 32512, 31855,
    31198, 30541, 29884, 29228, 28571, 27914, 27257, 26601, 25944, 25287, 24630, 23973, 23317,
    22660, 22003, 21346, 20689, 20033, 19376, 18719, 18062, 17406, 16749, 16092, 15435, 14778,
    14122, 13465, 12808, 12151, 11494, 10838, 10181, 9524, 8867, 8211, 7554, 6897, 6240, 5583,
    4927, 4270, 3613, 2956, 2300, 1643, 986, 329, 0,
];
