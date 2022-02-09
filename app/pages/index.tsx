import "@solana/wallet-adapter-react-ui/styles.css";
import REWARD_SCHEDULE from "./reward_schedule.json";

import Head from 'next/head'
import { ConnectionProvider, useWallet, useConnection, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  LedgerWalletAdapter,
  PhantomWalletAdapter,
  SlopeWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets";

import * as web3 from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import * as anchor from "@project-serum/anchor";
import { useEffect, useState } from "react";
import { SolcietyStakingPool, IDL } from "./solciety_staking_pool";
import { CreateMetadata, Creator, Metadata, MetadataData, MetadataDataData } from "@metaplex-foundation/mpl-token-metadata";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import Decimal from "decimal.js";

const PROGRAM_ID = new web3.PublicKey("FqNuLBJt753qBon7cFWxknyGwKYFY8WZ8xoYN5ynXCBx");
const SOLANA_CONNECTION_ENDPOINT = "http://172.16.115.128:8899";
const CIETY_TOKEN_MINT_ID = new web3.PublicKey("93Jd8nVyDuxPYd7Cfwumco9vF8KoN4Tba9SdYRCtBEtv");

// TODO: Do NOT include keypair on mainnet.
const STATE_KEYPAIR = web3.Keypair.fromSecretKey(bs58.decode("5ShxpFnV9DiWPe84WkDYDntjAhxEt2V2qwSGj6cd5k2VPkjUkfmjp16uQ8xETyvAJxt4hdp14BhbMSpr3v8LAavc"));

const STATE_ID = STATE_KEYPAIR.publicKey;

function Content() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [token, setToken] = useState<spl.Token | undefined>();
  const [tokenWalletId, setTokenWalletId] = useState<web3.PublicKey | undefined>();
  const [tokenBalance, setTokenBalance] = useState<spl.u64>(new spl.u64(0));

  const [currentTime, setCurrentTime] = useState<number>(+new Date());

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(() => {
      if (cancelled) return;
      setCurrentTime(+new Date());
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!wallet) {
      setToken(undefined);
      return;
    }

    setToken(new spl.Token(connection, CIETY_TOKEN_MINT_ID, spl.TOKEN_PROGRAM_ID, wallet as any));

    return () => {
      setToken(undefined);
    };
  }, [wallet]);

  useEffect(() => {
    if (!wallet.connected) {
      setTokenWalletId(undefined);
      return;
    }

    let cancelled = false;

    (async () => {
      const tokenWalletId = await spl.Token.getAssociatedTokenAddress(spl.ASSOCIATED_TOKEN_PROGRAM_ID, spl.TOKEN_PROGRAM_ID, CIETY_TOKEN_MINT_ID, wallet.publicKey);
      if (cancelled) return;
      setTokenWalletId(tokenWalletId);
    })();

    return () => {
      cancelled = true;
      setTokenWalletId(undefined);
    };
  }, [wallet]);

  useEffect(() => {
    if (!token || !tokenWalletId) {
      setTokenBalance(new spl.u64(0));
      return;
    }

    let cancelled = false;

    async function updateTokenBalance() {
      try {
        const info = await token.getAccountInfo(tokenWalletId);
        if (cancelled) return;
        setTokenBalance(info.amount);
      } catch (err) {
        if (cancelled) return;
        setTokenBalance(new spl.u64(0));
      }
    }

    const id = connection.onAccountChange(tokenWalletId, updateTokenBalance);
    updateTokenBalance();

    return () => {
      cancelled = true;
      setTokenBalance(new spl.u64(0));
      connection.removeAccountChangeListener(id);
    }
  }, [token, tokenWalletId]);

  const [balance, setBalance] = useState<number | undefined>();

  async function getAuthorityAddress(): Promise<[web3.PublicKey, number]> {
    return web3.PublicKey.findProgramAddress([Buffer.from("authority")], PROGRAM_ID);
  }

  async function getTreasuryAddress(): Promise<[web3.PublicKey, number]> {
    return web3.PublicKey.findProgramAddress([Buffer.from("treasury")], PROGRAM_ID);
  }

  useEffect(() => {
    if (!wallet.connected) {
      setBalance(undefined);
      return;
    }

    let cancelled = false;

    async function update() {
      const balance = await connection.getBalance(wallet.publicKey);
      if (cancelled) return;
      setBalance(balance);
    }

    const id = connection.onAccountChange(wallet.publicKey, update);
    update();

    return () => {
      cancelled = true;
      setBalance(undefined);
      connection.removeAccountChangeListener(id);
    };
  }, [connection, wallet]);

  const [authorityAddress, setAuthorityAddress] = useState<[web3.PublicKey, number] | undefined>();
  const [stakerAddress, setStakerAddress] = useState<[web3.PublicKey, number] | undefined>();
  const [treasuryAddress, setTreasuryAddress] = useState<[web3.PublicKey, number] | undefined>();

  useEffect(() => {
    async function updateAddresses() {
      setAuthorityAddress(await getAuthorityAddress());
      setTreasuryAddress(await getTreasuryAddress());
    }
    updateAddresses();
  }, []);

  useEffect(() => {
    if (!wallet.connected) {
      setStakerAddress(undefined);
      return;
    }
    let cancelled = false;
    async function updateStakerAddress() {
      const stakerAddress = await web3.PublicKey.findProgramAddress([Buffer.from("staker"), wallet.publicKey.toBuffer()], PROGRAM_ID);
      if (cancelled) return;
      setStakerAddress(stakerAddress);
    }
    updateStakerAddress();
    return () => {
      cancelled = true;
      setStakerAddress(undefined);
    }
  }, [wallet])

  const [state, setState] = useState<any | undefined>();
  const [staker, setStaker] = useState<any | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function fetchState() {
      const provider = new anchor.Provider(connection, undefined, { commitment: "confirmed" });
      const program = new anchor.Program<SolcietyStakingPool>(IDL, PROGRAM_ID, provider);

      try {
        const state = await program.account.state.fetch(STATE_ID);
        if (cancelled) return;
        console.log("State", state);
        setState(state);
      } catch {
        setState(undefined);
      }
    }

    const id = connection.onAccountChange(STATE_ID, fetchState);
    fetchState();

    return () => {
      cancelled = true;
      connection.removeAccountChangeListener(id);
    }
  }, []);

  useEffect(() => {
    if (!stakerAddress) {
      setStaker(undefined);
      return;
    }

    const [stakerId] = stakerAddress;

    let cancelled = false;

    async function fetchStaker() {
      const provider = new anchor.Provider(connection, undefined, { commitment: "confirmed" });
      const program = new anchor.Program<SolcietyStakingPool>(IDL, PROGRAM_ID, provider);

      try {
        const staker = await program.account.staker.fetch(stakerId);
        if (cancelled) return;
        console.log("Staker Info", staker);
        setStaker(staker);
      } catch {
        setStaker(undefined);
      }
    }

    const id = connection.onAccountChange(stakerId, fetchStaker);
    fetchStaker();

    return () => {
      cancelled = true;
      connection.removeAccountChangeListener(id);
    }
  }, [connection, wallet, stakerAddress]);

  interface LockedNFT {
    lockedAt: number
    lockDurationInDays: number
    metadata: MetadataData,
  }

  const [lockedNfts, setLockedNfts] = useState<LockedNFT[]>([]);
  const [selectedLockedNfts, setSelectedLockedNfts] = useState<Set<string>>(new Set<string>());


  useEffect(() => {
    if (!wallet.connected) {
      setLockedNfts([]);
      setSelectedLockedNfts(new Set<string>());
      return;
    }

    const provider = new anchor.Provider(connection, wallet, { commitment: "confirmed" });
    const program = new anchor.Program<SolcietyStakingPool>(IDL, PROGRAM_ID, provider);

    let cancelled = false;

    async function fetchLockedNfts() {
      const stakedNftResults = await program.account.lockedNft.all([{
        memcmp: {
          offset: 8,
          bytes: bs58.encode(wallet.publicKey.toBuffer()),
        }
      }]);
      if (cancelled) return;
      const lockedNftMetadataIds = await Promise.all(stakedNftResults.map(async stakedNftResult => await Metadata.getPDA(stakedNftResult.account.mintId)));
      const lockedNftMetadataAccounts = await connection.getMultipleAccountsInfo(lockedNftMetadataIds);
      const lockedNfts = lockedNftMetadataAccounts.map((account, i) => account ? {
        lockedAt: stakedNftResults[i].account.lockedAt.toNumber(),
        lockDurationInDays: stakedNftResults[i].account.lockDurationInDays.toNumber(),
        metadata: new Metadata(lockedNftMetadataIds[i], account as web3.AccountInfo<Buffer>).data,
      } : undefined).filter(Boolean);
      setLockedNfts(lockedNfts);

      console.log("Locked NFT's", lockedNfts);

      let newSelectedLockedNfts = new Set<string>();
      for (const lockedNft of lockedNfts) {
        if (selectedLockedNfts.has(lockedNft.metadata.mint)) {
          newSelectedLockedNfts.add(lockedNft.metadata.mint);
        }
      }
      setSelectedLockedNfts(newSelectedLockedNfts);
    }

    fetchLockedNfts();

    return () => {
      cancelled = true;
      setLockedNfts([]);
      setSelectedLockedNfts(new Set<string>());
    };
  }, [wallet]);

  const [unlockedNfts, setUnlockedNfts] = useState<MetadataData[]>([]);
  const [selectedUnlockedNfts, setSelectedUnlockedNfts] = useState<Set<string>>(new Set<string>());

  useEffect(() => {
    if (!wallet.connected) {
      setUnlockedNfts([]);
      setSelectedUnlockedNfts(new Set<string>());
      return;
    }

    let cancelled = false;

    async function fetchUnlockedNfts() {
      const tokenAccountResults = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { programId: spl.TOKEN_PROGRAM_ID });
      if (cancelled) return;

      const mintIds = tokenAccountResults.value
        .filter(result => new Decimal(result.account.data.parsed.info.tokenAmount.amount).eq(1))
        .map(result => result.account.data.parsed.info.mint);

      if (mintIds.length === 0) {
        setUnlockedNfts([]);
        setSelectedUnlockedNfts(new Set<string>());
        return;
      }

      const metadataIds = await Promise.all(mintIds.map(async mintId => await Metadata.getPDA(new web3.PublicKey(mintId))));
      if (cancelled) return;

      const metadataAccounts = await connection.getMultipleAccountsInfo(metadataIds);
      if (cancelled) return;

      const metadatas = metadataAccounts
        .map((account, i) => account ? new Metadata(metadataIds[i], account as web3.AccountInfo<Buffer>).data : undefined)
        .map((metadata) => metadata.data.creators.length > 0 && metadata.data.creators[0].address == "7QAB4Y3xGKtyV71qfasjbk1qXkZTTuEuR8WjsM2PijW5" && !metadata.data.creators[0].verified ? metadata : undefined)
        .filter(Boolean);

      setUnlockedNfts(metadatas);

      console.log("Unlocked NFT's", metadatas);

      let newSelectedUnlockedNfts = new Set<string>();
      for (const metadata of metadatas) {
        if (!selectedUnlockedNfts.has(metadata.mint)) continue;
        newSelectedUnlockedNfts = newSelectedUnlockedNfts.add(metadata.mint);
      }
      setSelectedUnlockedNfts(newSelectedUnlockedNfts);
    }

    fetchUnlockedNfts();

    return () => {
      cancelled = true;
      setUnlockedNfts([]);
      setSelectedUnlockedNfts(new Set<string>());
    };
  }, [wallet]);

  const [airdropping, setAirdropping] = useState(false);

  async function onClickAirdrop() {
    if (!wallet.connected) return;

    try {
      setAirdropping(true);

      const transactionId = await connection.requestAirdrop(wallet.publicKey, 2 * web3.LAMPORTS_PER_SOL);
      await connection.confirmTransaction(transactionId);
      console.log(`Transaction ID: ${transactionId}`);
    } catch (err) {
      console.error(err);
    } finally {
      setAirdropping(false);
    }
  }

  const [mintingNft, setMintingNft] = useState(false);

  async function onClickMintNft() {
    if (!wallet.connected) return;

    try {
      setMintingNft(true);

      const mint = web3.Keypair.generate();
      const ata = await spl.Token.getAssociatedTokenAddress(spl.ASSOCIATED_TOKEN_PROGRAM_ID, spl.TOKEN_PROGRAM_ID, mint.publicKey, wallet.publicKey);
      const numLamportsNeededForMint = await spl.Token.getMinBalanceRentForExemptMint(connection);

      const tx = new web3.Transaction();
      tx.add(web3.SystemProgram.createAccount({ fromPubkey: wallet.publicKey, newAccountPubkey: mint.publicKey, lamports: numLamportsNeededForMint, space: spl.MintLayout.span, programId: spl.TOKEN_PROGRAM_ID }));
      tx.add(spl.Token.createInitMintInstruction(spl.TOKEN_PROGRAM_ID, mint.publicKey, 0, wallet.publicKey, wallet.publicKey));
      tx.add(spl.Token.createAssociatedTokenAccountInstruction(spl.ASSOCIATED_TOKEN_PROGRAM_ID, spl.TOKEN_PROGRAM_ID, mint.publicKey, ata, wallet.publicKey, wallet.publicKey));
      tx.add(spl.Token.createMintToInstruction(spl.TOKEN_PROGRAM_ID, mint.publicKey, ata, wallet.publicKey, [], 1));

      tx.add(new CreateMetadata({ feePayer: wallet.publicKey }, {
        metadata: await Metadata.getPDA(mint.publicKey),
        metadataData: new MetadataDataData({
          name: "Solciety Test NFT",
          symbol: "SOLCIETY",
          uri: "",
          sellerFeeBasisPoints: 500,
          creators: [
            new Creator({ address: "7QAB4Y3xGKtyV71qfasjbk1qXkZTTuEuR8WjsM2PijW5", verified: false, share: 0 }),
            new Creator({ address: wallet.publicKey.toBase58(), verified: true, share: 100 }),
          ]
        }),
        updateAuthority: wallet.publicKey,
        mint: mint.publicKey,
        mintAuthority: wallet.publicKey,
      }));

      tx.add(spl.Token.createSetAuthorityInstruction(spl.TOKEN_PROGRAM_ID, mint.publicKey, null, "MintTokens", wallet.publicKey, []));

      const transactionId = await wallet.sendTransaction(tx, connection, { signers: [mint] });
      await connection.confirmTransaction(transactionId);
      console.log(`Transaction ID: ${transactionId}`);
      console.log((await connection.getConfirmedTransaction(transactionId)).meta.logMessages);
    } catch (err) {
      console.error(err);
    } finally {
      setMintingNft(false);
    }
  }

  const [claimingRewards, setClaimingRewards] = useState(false);

  async function onClickClaimRewards() {
    if (!wallet.connected) return;
    if (claimingRewards) return;

    const provider = new anchor.Provider(connection, wallet, { commitment: "confirmed" });
    const program = new anchor.Program<SolcietyStakingPool>(IDL, PROGRAM_ID, provider);

    const [authorityId, authorityBump] = authorityAddress;
    const [treasuryId] = treasuryAddress;

    try {
      setClaimingRewards(true);

      const [stakerId] = await web3.PublicKey.findProgramAddress([Buffer.from("staker"), wallet.publicKey.toBuffer()], PROGRAM_ID);
      const rewardAtaId = await spl.Token.getAssociatedTokenAddress(spl.ASSOCIATED_TOKEN_PROGRAM_ID, spl.TOKEN_PROGRAM_ID, CIETY_TOKEN_MINT_ID, wallet.publicKey);

      const tx = new web3.Transaction();

      tx.add(program.instruction.claimRewards(authorityBump, {
        accounts: {
          user: wallet.publicKey,
          state: STATE_ID,
          authority: authorityId,
          staker: stakerId,
          rewardTokenMint: CIETY_TOKEN_MINT_ID,
          rewardToken: rewardAtaId,
          rewardTokenTreasury: treasuryId,
          rent: web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        }
      }));

      const transactionId = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(transactionId);
      console.log(`Transaction ID: ${transactionId}`);
      console.log((await connection.getConfirmedTransaction(transactionId)).meta.logMessages);
    } catch (err) {
      console.error(err);
    } finally {
      setClaimingRewards(false);
    }
  }

  const [unstakingNfts, setUnstakingNfts] = useState(false);

  async function onClickUnstakeNfts() {
    if (!wallet.connected) return;
    if (unstakingNfts) return;
    if (selectedLockedNfts.size === 0) return;

    const provider = new anchor.Provider(connection, wallet, { commitment: "confirmed" });
    const program = new anchor.Program<SolcietyStakingPool>(IDL, PROGRAM_ID, provider);

    const [authorityId, authorityBump] = authorityAddress;

    try {
      setUnstakingNfts(true);

      const [stakerId] = await web3.PublicKey.findProgramAddress([Buffer.from("staker"), wallet.publicKey.toBuffer()], PROGRAM_ID);

      const tx = new web3.Transaction();

      for (const rawMintId of Array.from(selectedLockedNfts.keys())) {
        const mintId = new web3.PublicKey(rawMintId);
        const nftId = await spl.Token.getAssociatedTokenAddress(spl.ASSOCIATED_TOKEN_PROGRAM_ID, spl.TOKEN_PROGRAM_ID, mintId, wallet.publicKey);
        const [escrowId] = await web3.PublicKey.findProgramAddress([Buffer.from("escrow"), mintId.toBuffer()], PROGRAM_ID);
        const [lockedNftId] = await web3.PublicKey.findProgramAddress([Buffer.from("locked_nft"), mintId.toBuffer()], PROGRAM_ID);

        tx.add(program.instruction.unstake(authorityBump, {
          accounts: {
            user: wallet.publicKey,
            state: STATE_ID,
            authority: authorityId,
            nftMint: mintId,
            nft: nftId,
            nftEscrow: escrowId,
            staker: stakerId,
            lockedNft: lockedNftId,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: web3.SystemProgram.programId,
          }
        }));
      }

      const transactionId = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(transactionId);
      console.log(`Transaction ID: ${transactionId}`);
      console.log((await connection.getConfirmedTransaction(transactionId)).meta.logMessages);
    } catch (err) {
      console.error(err);
    } finally {
      setUnstakingNfts(false);
    }
  }

  const [extendingNfts, setExtendingNfts] = useState(false);

  async function onClickExtendNfts() {
    if (!wallet.connected) return;
    if (extendingNfts) return;
    if (selectedLockedNfts.size === 0) return;

    const provider = new anchor.Provider(connection, wallet, { commitment: "confirmed" });
    const program = new anchor.Program<SolcietyStakingPool>(IDL, PROGRAM_ID, provider);

    const [authorityId] = authorityAddress;

    try {
      setExtendingNfts(true);

      const [stakerId] = await web3.PublicKey.findProgramAddress([Buffer.from("staker"), wallet.publicKey.toBuffer()], PROGRAM_ID);

      const tx = new web3.Transaction();

      for (const rawMintId of Array.from(selectedLockedNfts.keys())) {
        const mintId = new web3.PublicKey(rawMintId);
        const [lockedNftId] = await web3.PublicKey.findProgramAddress([Buffer.from("locked_nft"), mintId.toBuffer()], PROGRAM_ID);

        tx.add(program.instruction.extend(new anchor.BN(numDaysToExtend), {
          accounts: {
            user: wallet.publicKey,
            state: STATE_ID,
            authority: authorityId,
            nftMint: mintId,
            staker: stakerId,
            lockedNft: lockedNftId,
          }
        }));
      }

      const transactionId = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(transactionId);
      console.log(`Transaction ID: ${transactionId}`);
      console.log((await connection.getConfirmedTransaction(transactionId)).meta.logMessages);
    } catch (err) {
      console.error(err);
    } finally {
      setExtendingNfts(false);
    }
  }

  const [stakingNfts, setStakingNfts] = useState(false);

  async function onClickStakeNfts() {
    if (!wallet.connected) return;
    if (stakingNfts) return;
    if (selectedUnlockedNfts.size === 0) return;

    const provider = new anchor.Provider(connection, wallet, { commitment: "confirmed" });
    const program = new anchor.Program<SolcietyStakingPool>(IDL, PROGRAM_ID, provider);

    const [authorityId] = authorityAddress;

    try {
      setStakingNfts(true);

      const [stakerId] = await web3.PublicKey.findProgramAddress([Buffer.from("staker"), wallet.publicKey.toBuffer()], PROGRAM_ID);

      const tx = new web3.Transaction();

      for (const rawMintId of Array.from(selectedUnlockedNfts.keys())) {
        const mintId = new web3.PublicKey(rawMintId);
        const nftId = await spl.Token.getAssociatedTokenAddress(spl.ASSOCIATED_TOKEN_PROGRAM_ID, spl.TOKEN_PROGRAM_ID, mintId, wallet.publicKey);
        const metadataId = await Metadata.getPDA(mintId);
        const [escrowId] = await web3.PublicKey.findProgramAddress([Buffer.from("escrow"), mintId.toBuffer()], PROGRAM_ID);
        const [lockedNftId] = await web3.PublicKey.findProgramAddress([Buffer.from("locked_nft"), mintId.toBuffer()], PROGRAM_ID);

        tx.add(program.instruction.stake(new anchor.BN(numDaysToStake), {
          accounts: {
            user: wallet.publicKey,
            state: STATE_ID,
            authority: authorityId,
            nft: nftId,
            nftMint: mintId,
            nftMetadata: metadataId,
            nftEscrow: escrowId,
            staker: stakerId,
            lockedNft: lockedNftId,
            rent: web3.SYSVAR_RENT_PUBKEY,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: web3.SystemProgram.programId,
          }
        }));
      }

      const transactionId = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(transactionId);
      console.log(`Transaction ID: ${transactionId}`);
      console.log((await connection.getConfirmedTransaction(transactionId)).meta.logMessages);
    } catch (err) {
      console.error(err);
    } finally {
      setStakingNfts(false);
    }
  }

  async function onClickInit() {
    if (!wallet.connected) return;
    if (state) return;

    const [authorityId] = authorityAddress;
    const [treasuryId] = treasuryAddress;

    const provider = new anchor.Provider(connection, wallet, { commitment: "confirmed" });
    const program = new anchor.Program<SolcietyStakingPool>(IDL, PROGRAM_ID, provider);

    await program.rpc.initialize({
      preInstructions: [await program.account.state.createInstruction(STATE_KEYPAIR)],
      accounts: {
        admin: wallet.publicKey,
        state: STATE_ID,
        authority: authorityId,
        rewardTokenMint: CIETY_TOKEN_MINT_ID,
        rewardTokenTreasury: treasuryId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [STATE_KEYPAIR],
    });
  }

  const [numDaysToStake, setNumDaysToStake] = useState(1);
  const [numDaysToExtend, setNumDaysToExtend] = useState(1);

  const venftDecayRatePerDay = new Decimal(1).div(Math.floor(365 / 2));

  function getDaysElapsedBetweenTimestamps(start: number, end: number): number {
    return Math.max(0, (end - start) / (24 * 60 * 60));
  }

  function getDaysElapsedSinceProgramDeployed(): number | undefined {
    if (!state) return undefined;
    return getDaysElapsedBetweenTimestamps(+state.deployedAt.toString(), Math.floor(currentTime / 1000));
  }

  function getDaysElapsedSinceStakerLastUpdated(): number | undefined {
    if (!staker) return undefined;
    return getDaysElapsedBetweenTimestamps(+staker.lastUpdatedAt.toString(), Math.floor(currentTime / 1000));
  }

  function getEstimatedStakerVenftBalance(): Decimal | undefined {
    if (!staker) return undefined;
    const secondsElapsedInDay = Math.floor(currentTime / 1000) % (24 * 60 * 60);
    const dayIndex = Math.floor(getDaysElapsedSinceStakerLastUpdated());
    const currentVenftBalance = new Decimal(dayIndex < staker.venftBalance.length ? staker.venftBalance[dayIndex].toString() : 0);
    const nextVenftBalance = new Decimal(dayIndex + 1 < staker.venftBalance.length ? staker.venftBalance[dayIndex + 1].toString() : 0);
    const balance = currentVenftBalance.add(nextVenftBalance.sub(currentVenftBalance).mul(secondsElapsedInDay / (24 * 60 * 60)));
    return balance.div(1_000_000_000).div(Math.floor(365 / 2));
  }

  function getEstimatedTotalVenftSupply(): Decimal | undefined {
    if (!state) return undefined;
    const secondsElapsedInDay = Math.floor(currentTime / 1000) % (24 * 60 * 60);
    const dayIndex = Math.floor(getDaysElapsedSinceProgramDeployed());
    const currentVenftSupply = new Decimal(dayIndex < state.venftSupply.length ? state.venftSupply[dayIndex].toString() : 0);
    const nextVenftSupply = new Decimal(dayIndex + 1 < state.venftSupply.length ? state.venftSupply[dayIndex + 1].toString() : 0);
    const balance = currentVenftSupply.add(nextVenftSupply.sub(currentVenftSupply).mul(secondsElapsedInDay / (24 * 60 * 60)));
    return balance.div(1_000_000_000).div(Math.floor(365 / 2));
  }

  function getRewardsAccumulatedByStaker(): Decimal | undefined {
    if (!state || !staker) return undefined;
    const stateOffset = Math.floor(getDaysElapsedBetweenTimestamps(+state.deployedAt.toString(), +staker.lastUpdatedAt.toString()));
    const stakerOffset = Math.floor(getDaysElapsedSinceStakerLastUpdated());

    let accumulated = new Decimal(staker.numRewardsClaimable.toString());
    for (let i = 0; i < Math.min(stakerOffset, staker.venftBalance.length); i++) {
      accumulated = accumulated.add(new Decimal(REWARD_SCHEDULE[i]).mul(staker.venftBalance[i]).div(state.venftSupply[stateOffset + i]));
    }

    return accumulated;
  }

  function getTodaysTotalRewards(): Decimal | undefined {
    if (!state) return undefined;
    const stateOffset = Math.floor(getDaysElapsedBetweenTimestamps(+state.deployedAt.toString(), Math.floor(currentTime / 1000)));
    return new Decimal(REWARD_SCHEDULE[stateOffset]);
  }

  function getTodaysEstimatedRewards(): Decimal | undefined {
    if (!state || !staker) return undefined;
    const stateOffset = Math.floor(getDaysElapsedBetweenTimestamps(+state.deployedAt.toString(), +staker.lastUpdatedAt.toString()));
    const stakerOffset = Math.floor(getDaysElapsedSinceStakerLastUpdated());
    if (stateOffset + stakerOffset >= state.venftSupply.length) return new Decimal(0);
    if (stakerOffset >= staker.venftBalance.length) return new Decimal(0);
    return new Decimal(REWARD_SCHEDULE[stateOffset + stakerOffset]).mul(staker.venftBalance[stakerOffset].toString()).div(state.venftSupply[stateOffset + stakerOffset].toString());
  }

  return (
    <div className="grid gap-4 p-4 text-sm">
      <div>
        <h1 className="font-bold text-2xl mb-2">
          Solciety
        </h1>

        <div>
          <WalletMultiButton />
        </div>
      </div>

      <div>
        <h2 className="font-bold text-xl mb-2">Settings</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <h3 className="font-semibold">Current Time</h3>
            <p className="overflow-hidden text-ellipsis whitespace-nowrap" suppressHydrationWarning={true}>{new Date(currentTime).toLocaleString()}</p>
          </div>
          <div>
            <h3 className="font-semibold">Connection Endpoint</h3>
            <p className="overflow-hidden text-ellipsis">{SOLANA_CONNECTION_ENDPOINT}</p>
          </div>
          <div>
            <h3 className="font-semibold">Contract Address</h3>
            <p className="overflow-hidden text-ellipsis">{PROGRAM_ID.toBase58()}</p>
          </div>
          <div>
            <h3 className="font-semibold">$CIETY Token Mint Address</h3>
            <p className="overflow-hidden text-ellipsis">{CIETY_TOKEN_MINT_ID.toBase58()}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <h2 className="font-bold text-xl">Account</h2>

        <div className="grid grid-cols-4 gap-4 mb-2">
          <div>
            <h3 className="font-semibold">$CIETY Wallet Address</h3>
            <p className="overflow-hidden text-ellipsis">{tokenWalletId ? tokenWalletId.toBase58() : "(loading)"}</p>
          </div>

          <div>
            <h3 className="font-semibold">Wallet Balance ($SOL)</h3>
            <p className="overflow-hidden text-ellipsis">{balance ? new Decimal(balance).div(web3.LAMPORTS_PER_SOL).toFixed(9) : "0"} $SOL</p>
          </div>

          <div>
            <h3 className="font-semibold">Wallet Balance ($CIETY)</h3>
            <p className="overflow-hidden text-ellipsis">{new Decimal(tokenBalance.toString()).div(1_000_000_000).toFixed(9)} $CIETY</p>
          </div>
        </div>

        <div className="grid grid-flow-col gap-4">
          <button onClick={onClickAirdrop} disabled={!wallet.connected || airdropping} className="bg-neutral-100 py-1 px-2 disabled:text-gray-500">Airdrop {2} SOL</button>
          <button onClick={onClickMintNft} disabled={!wallet.connected || mintingNft} className="bg-neutral-100 py-1 px-2 disabled:text-gray-500">Mint Test NFT</button>
        </div>
      </div>

      <div className="grid gap-2">
        <h2 className="font-bold text-xl">Staker Info</h2>
        <div className="grid grid-cols-4 gap-4 mb-2">
          <div>
            <h3 className="font-semibold">Staker PDA Address</h3>
            <p className="overflow-hidden text-ellipsis">{stakerAddress ? stakerAddress[0].toBase58() : "(loading)"}</p>
          </div>

          <div>
            <h3 className="font-semibold">Number of Locked NFT's</h3>
            <p className="overflow-hidden text-ellipsis">{staker ? staker.numLockedNfts.toNumber() : "Never staked before."}</p>
          </div>

          <div>
            <h3 className="font-semibold">Estimated veNFT Tokens Owned</h3>
            <p className="overflow-hidden text-ellipsis">{staker ? `${getEstimatedStakerVenftBalance().toFixed(9)} veNFT` : "Never staked before."}</p>
          </div>

          <div>
            <h3 className="font-semibold">$CIETY Rewards Claimable</h3>
            <p className="overflow-hidden text-ellipsis">{state && staker ? `${getRewardsAccumulatedByStaker().toFixed(9)} $CIETY` : "Never staked before."}</p>
          </div>

          <div>
            <h3 className="font-semibold">Todays Estimated $CIETY Rewards</h3>
            <p className="overflow-hidden text-ellipsis">{state && staker ? `${getTodaysEstimatedRewards().toFixed(9)} $CIETY` : "Never staked before."}</p>
          </div>

          <div>
            <h3 className="font-semibold">Num. Days Since Last Updated Onchain</h3>
            <p className="overflow-hidden text-ellipsis">{staker ? `${getDaysElapsedSinceStakerLastUpdated().toFixed(9)} day(s)` : "Never staked before."}</p>
          </div>

          <div>
            <h3 className="font-semibold">Last Updated Onchain At</h3>
            <p className="overflow-hidden text-ellipsis whitespace-nowrap">{staker && staker.lastUpdatedAt.toNumber() !== 0 ? new Date(staker.lastUpdatedAt.toNumber() * 1000).toLocaleString() : "Never staked before."}</p>
          </div>

          <div>
            <h3 className="font-semibold">Last Claimed Rewards At</h3>
            <p className="overflow-hidden text-ellipsis whitespace-nowrap">{staker && staker.lastClaimedAt.toNumber() !== 0 ? new Date(staker.lastClaimedAt.toNumber() * 1000).toLocaleString() : "Never claimed before."}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <h2 className="font-bold text-xl">NFT's Not Yet Locked</h2>
        <div className="grid grid-cols-4 gap-4 mb-4">
          {unlockedNfts.length > 0 ? unlockedNfts.map((unlockedNft) => (
            <div className={`grid grid-flow-col ${selectedUnlockedNfts.has(unlockedNft.mint) ? "bg-neutral-400" : "bg-neutral-200"}`} key={unlockedNft.mint} >
              <button className="w-10 bg-neutral-800" onClick={() => {
                if (selectedUnlockedNfts.delete(unlockedNft.mint)) {
                  return setSelectedUnlockedNfts(new Set(selectedUnlockedNfts));
                }
                return setSelectedUnlockedNfts(new Set(selectedUnlockedNfts.add(unlockedNft.mint)));
              }} />
              <div className="grid gap-2 p-2">
                <div className="overflow-hidden text-ellipsis">
                  <h4 className="font-semibold font-lg overflow-hidden text-ellipsis">{unlockedNft.data.name}</h4>
                  <p className="overflow-hidden text-ellipsis">{unlockedNft.mint}</p>
                </div>
              </div>
            </div>
          )) : `No unstaked NFT's.`}
        </div>

        <div className="grid grid-flow-col gap-4">
          <div className="flex flex-col gap-4">
            <input type="range" min={1} max={365 / 2} value={numDaysToStake} onChange={event => setNumDaysToStake(Number(event.target.value))} />
            <button onClick={onClickStakeNfts} disabled={!wallet.connected || stakingNfts || selectedUnlockedNfts.size === 0} className="bg-neutral-100 py-1 px-2 disabled:text-gray-500">Stake {selectedUnlockedNfts.size} NFT(s) for {numDaysToStake} day(s)</button>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <h2 className="font-bold text-xl">NFT's Locked</h2>
        <div className="grid grid-cols-4 gap-4 mb-4">
          {lockedNfts.length > 0 ? lockedNfts.map((lockedNft) => (
            <div className={`grid grid-flow-col ${selectedLockedNfts.has(lockedNft.metadata.mint) ? "bg-neutral-400" : "bg-neutral-200"}`} key={lockedNft.metadata.mint}>
              <button className="w-10 bg-neutral-800" onClick={() => {
                if (selectedLockedNfts.delete(lockedNft.metadata.mint)) {
                  return setSelectedLockedNfts(new Set(selectedLockedNfts));
                }
                return setSelectedLockedNfts(new Set(selectedLockedNfts.add(lockedNft.metadata.mint)));
              }} />
              <div className="grid gap-2 p-2">
                <div className="grid gap-2">
                  <div className="overflow-hidden text-ellipsis">
                    <h4 className="font-semibold font-lg overflow-hidden text-ellipsis">{lockedNft.metadata.data.name}</h4>
                    <p className="overflow-hidden text-ellipsis">{lockedNft.metadata.mint}</p>
                  </div>

                  <div className="overflow-hidden text-ellipsis">
                    <h4 className="font-semibold">Lock Start Date</h4>
                    <p className="overflow-hidden text-ellipsis whitespace-nowrap">{new Date(lockedNft.lockedAt * 1000).toLocaleString()}</p>
                  </div>

                  <div className="overflow-hidden text-ellipsis">
                    <h4 className="font-semibold">Lock End Date</h4>
                    <p className="overflow-hidden text-ellipsis whitespace-nowrap">{new Date(lockedNft.lockedAt * 1000 + lockedNft.lockDurationInDays * 24 * 60 * 60 * 1000).toLocaleString()}</p>
                  </div>

                  <div className="overflow-hidden text-ellipsis">
                    <h4 className="font-semibold">Locked For</h4>
                    <p className="overflow-hidden text-ellipsis">{lockedNft.lockDurationInDays} day(s)</p>
                  </div>
                </div>
              </div>
            </div>
          )) : `No staked NFT's.`}
        </div>

        <div className="grid grid-flow-col gap-4">
          <div className="flex flex-col gap-4">
            <input type="range" min={1} max={365 / 2} value={numDaysToExtend} onChange={event => setNumDaysToExtend(Number(event.target.value))} />
            <button onClick={onClickExtendNfts} disabled={!wallet.connected || extendingNfts || selectedLockedNfts.size === 0} className="bg-neutral-100 py-1 px-2 disabled:text-gray-500">
              Extend {selectedLockedNfts.size} NFT(s) for {numDaysToExtend} day(s)
            </button>
          </div>

          <div className="flex">
            <button onClick={onClickUnstakeNfts} disabled={!wallet.connected || unstakingNfts || selectedLockedNfts.size === 0} className="grow bg-neutral-100 py-1 px-2 disabled:text-gray-500">Unstake {selectedLockedNfts.size} NFT(s)</button>
          </div>

          <div className="flex">
            <button onClick={onClickClaimRewards} disabled={!wallet.connected || claimingRewards} className="grow bg-neutral-100 py-1 px-2 disabled:text-gray-500">Claim All Rewards</button>
          </div>


        </div>
      </div>

      <div>
        <h2 className="font-bold text-xl mb-2">Program</h2>
        <div className="grid grid-cols-4 gap-4 mb-2">
          <div>
            <h3 className="font-semibold">State Address</h3>
            <p className="overflow-hidden text-ellipsis">{STATE_ID.toBase58()}</p>
          </div>
          <div>
            <h3 className="font-semibold">Treasury PDA Address</h3>
            <p className="overflow-hidden text-ellipsis">{treasuryAddress ? treasuryAddress[0].toBase58() : "(loading)"}</p>
          </div>
          <div>
            <h3 className="font-semibold">Admin ID</h3>
            <p className="overflow-hidden text-ellipsis">{state ? state.adminId.toBase58() : "Uninitialized."}</p>
          </div>
          <div>
            <h3 className="font-semibold">Reward Token Mint ID</h3>
            <p className="overflow-hidden text-ellipsis">{state ? state.rewardTokenMintId.toBase58() : "Uninitialized."}</p>
          </div>
          <div>
            <h3 className="font-semibold">Num. Days Since Deployed</h3>
            <p className="overflow-hidden text-ellipsis">{state ? `${getDaysElapsedSinceProgramDeployed().toFixed(9)} day(s)` : "Uninitialized."}</p>
          </div>
          <div>
            <h3 className="font-semibold">Deployed At</h3>
            <p className="overflow-hidden text-ellipsis whitespace-nowrap">{state ? new Date(state.deployedAt.toNumber() * 1000).toLocaleString() : "Uninitialized."}</p>
          </div>
          <div>
            <h3 className="font-semibold">Last Updated Onchain At</h3>
            <p className="overflow-hidden text-ellipsis whitespace-nowrap">{state ? new Date(state.lastUpdatedAt.toNumber() * 1000).toLocaleString() : "Uninitialized."}</p>
          </div>
          <div>
            <h3 className="font-semibold">Total NFT's Locked</h3>
            <p className="overflow-hidden text-ellipsis">{state ? `${state.totalNumLockedNfts.toNumber()} NFT(s)` : "Uninitialized."}</p>
          </div>
          <div>
            <h3 className="font-semibold">veNFT Decay Rate Per NFT</h3>
            <p className="overflow-hidden text-ellipsis">{`${venftDecayRatePerDay.toFixed(9)} veNFT / day`}</p>
          </div>
          <div>
            <h3 className="font-semibold">Todays Total $CIETY Rewards</h3>
            <p className="overflow-hidden text-ellipsis">{state ? `${getTodaysTotalRewards().toFixed(9)} $CIETY` : "Uninitialized."}</p>
          </div>
          <div>
            <h3 className="font-semibold">Estimated Total veNFT Supply</h3>
            <p className="overflow-hidden text-ellipsis">{state ? `${getEstimatedTotalVenftSupply().toFixed(9)} veNFT` : "Uninitialized."}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-flow-col gap-2">
        <button onClick={onClickInit} disabled={!wallet.connected || state} className="bg-neutral-100 py-1 px-2 disabled:text-gray-500">Initialize Program</button>

      </div>
    </div >
  );
}

export default function Home() {
  const walletAdapters = [
    new PhantomWalletAdapter(),
    new SlopeWalletAdapter(),
    new SolflareWalletAdapter(),
    new TorusWalletAdapter(),
    new LedgerWalletAdapter(),
  ];
  return (
    <div>
      <Head>
        <title>Solciety NFT</title>
        <meta name="description" content="A staking pool for Solciety NFT's." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <ConnectionProvider endpoint={SOLANA_CONNECTION_ENDPOINT}>
          <WalletProvider wallets={walletAdapters}>
            <WalletModalProvider>
              <Content />
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </main>
    </div>
  )
}
