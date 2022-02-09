# solciety-program-library

Solana programs under the Solciety ecosystem.

## solciety-staking-pool

A staking pool for Solciety's NFT's. Design largely inspired by Curve Finance's veCRV model. A single cycle spans one day. A total of 700 million $CIETY tokens are to be distributed over a span of 4 years. Both reward emissions and stake weight linear decay on a cycle-by-cycle basis.

### Dependencies

1. Rust/Cargo
2. Anchor CLI
3. SPL Token CLI
4. Solana CLI
5. Solana Browser Wallet

### Getting Started

1. Build all programs.

```console
$ anchor build
```

2. Fetch and record your program's ID down. Update constants at the top of `program/solciety-staking-pool/src/lib.rs`, `app/pages/index.tsx`, and `Anchor.toml` such that they contain your program's ID.

```console
$ solana address -k target/deploy/solciety_staking_pool-keypair.json
```

3. Copy `solciety_staking_pool.ts` from `target/types` to `app/pages`.

```console
$ cp target/types/solciety_staking_pool.ts app/pages/solciety_staking_pool.ts
```

4. Start a new local test network with the staking pool program and Metaplex token metadata program deployed.

```console
$ anchor localnet
```

5. Configure the Solana CLI to work with your local test network.

```console
$ solana config set --url localhost
```

6. Instantiate the $CIETY token mint. Record the $CIETY token mint ID down. Update constants at the top of the file `app/pages/index.tsx` such that it contains your newly-instantiated $CIETY token mint's ID.

```console
$ spl-token create-token
```

7. Optionally instantiate a $CIETY token account for yourself. Record down your $CIETY token account ID. Optionally mint yourself some $CIETY tokens.

```console
$ spl-token create-account ${TOKEN_MINT_ID} --owner ${USER_ID}
$ spl-token mint ${TOKEN_MINT_ID} ${AMOUNT_OF_TOKENS} ${USER_CIETY_TOKEN_ACCOUNT_ID}
```

8. Run the web frontend.

```console
$ cd app && npm run dev
```

9. Visit the web frontend on your browser, connect your Solana wallet, and configure your Solana wallet's network to be `Localhost`. Airdrop yourself some SOL by clicking on the `Airdrop 2 SOL` button.

10. On the web frontend, at the very bottom of the page, there is an 'Initialize Program' button. Click it and approve any transaction confirmation prompts which may appear.

11. Mint 700,000,000 $CIETY tokens to the `Treasury PDA ID` specified on the page.

```console
$ spl-token mint ${TOKEN_MINT_ID} 700000000 ${TREASURY_PDA_ID}
```