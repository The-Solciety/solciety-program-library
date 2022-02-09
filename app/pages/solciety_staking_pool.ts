export type SolcietyStakingPool = {
  "version": "0.1.0",
  "name": "solciety_staking_pool",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "admin",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rewardTokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rewardTokenTreasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "stake",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nftMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nft",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftEscrow",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "staker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "lockedNft",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "lockDurationInDays",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimRewards",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "staker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rewardTokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rewardToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rewardTokenTreasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "authorityBump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "extend",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nftMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "staker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "lockedNft",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "lockDurationInDays",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unstake",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nftMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nft",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftEscrow",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "staker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "lockedNft",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "authorityBump",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "authority",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stateId",
            "type": "publicKey"
          }
        ]
      }
    },
    {
      "name": "lockedNft",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakerId",
            "type": "publicKey"
          },
          {
            "name": "mintId",
            "type": "publicKey"
          },
          {
            "name": "lockedAt",
            "type": "i64"
          },
          {
            "name": "lockDurationInDays",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "state",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "adminId",
            "type": "publicKey"
          },
          {
            "name": "rewardTokenMintId",
            "type": "publicKey"
          },
          {
            "name": "deployedAt",
            "type": "i64"
          },
          {
            "name": "lastUpdatedAt",
            "type": "i64"
          },
          {
            "name": "totalNumLockedNfts",
            "type": "u64"
          },
          {
            "name": "venftSupply",
            "type": {
              "array": [
                "u64",
                1461
              ]
            }
          }
        ]
      }
    },
    {
      "name": "staker",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakerId",
            "type": "publicKey"
          },
          {
            "name": "venftBalance",
            "type": {
              "array": [
                "u64",
                183
              ]
            }
          },
          {
            "name": "numLockedNfts",
            "type": "u64"
          },
          {
            "name": "numRewardsClaimable",
            "type": "u64"
          },
          {
            "name": "lastUpdatedAt",
            "type": "i64"
          },
          {
            "name": "lastClaimedAt",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "ErrorCode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "UnexpectedRewardTokenMintId"
          },
          {
            "name": "UnexpectedRewardTokenMintDecimals"
          },
          {
            "name": "MetadataMintMismatch"
          },
          {
            "name": "MetadataHasNoCreators"
          },
          {
            "name": "MetadataCreatorUnverified"
          },
          {
            "name": "UnexpectedMetadataCreator"
          },
          {
            "name": "StakerIdMismatch"
          },
          {
            "name": "LockDurationTooSmall"
          },
          {
            "name": "MaxPossibleLockDurationExceeded"
          },
          {
            "name": "NotYetUnlockable"
          }
        ]
      }
    },
    {
      "name": "AccountLoaderStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Uninitialized",
            "fields": [
              {
                "defined": "RefMut<'info,T>"
              }
            ]
          },
          {
            "name": "Initialized",
            "fields": [
              {
                "defined": "RefMut<'info,T>"
              }
            ]
          }
        ]
      }
    }
  ]
};

export const IDL: SolcietyStakingPool = {
  "version": "0.1.0",
  "name": "solciety_staking_pool",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "admin",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rewardTokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rewardTokenTreasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "stake",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nftMetadata",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nft",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftEscrow",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "staker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "lockedNft",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "lockDurationInDays",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimRewards",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "staker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rewardTokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rewardToken",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rewardTokenTreasury",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "authorityBump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "extend",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nftMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "staker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "lockedNft",
          "isMut": true,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "lockDurationInDays",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unstake",
      "accounts": [
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "state",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nftMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "nft",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "nftEscrow",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "staker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "lockedNft",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "associatedTokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "authorityBump",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "authority",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stateId",
            "type": "publicKey"
          }
        ]
      }
    },
    {
      "name": "lockedNft",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakerId",
            "type": "publicKey"
          },
          {
            "name": "mintId",
            "type": "publicKey"
          },
          {
            "name": "lockedAt",
            "type": "i64"
          },
          {
            "name": "lockDurationInDays",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "state",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "adminId",
            "type": "publicKey"
          },
          {
            "name": "rewardTokenMintId",
            "type": "publicKey"
          },
          {
            "name": "deployedAt",
            "type": "i64"
          },
          {
            "name": "lastUpdatedAt",
            "type": "i64"
          },
          {
            "name": "totalNumLockedNfts",
            "type": "u64"
          },
          {
            "name": "venftSupply",
            "type": {
              "array": [
                "u64",
                1461
              ]
            }
          }
        ]
      }
    },
    {
      "name": "staker",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakerId",
            "type": "publicKey"
          },
          {
            "name": "venftBalance",
            "type": {
              "array": [
                "u64",
                183
              ]
            }
          },
          {
            "name": "numLockedNfts",
            "type": "u64"
          },
          {
            "name": "numRewardsClaimable",
            "type": "u64"
          },
          {
            "name": "lastUpdatedAt",
            "type": "i64"
          },
          {
            "name": "lastClaimedAt",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "ErrorCode",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "UnexpectedRewardTokenMintId"
          },
          {
            "name": "UnexpectedRewardTokenMintDecimals"
          },
          {
            "name": "MetadataMintMismatch"
          },
          {
            "name": "MetadataHasNoCreators"
          },
          {
            "name": "MetadataCreatorUnverified"
          },
          {
            "name": "UnexpectedMetadataCreator"
          },
          {
            "name": "StakerIdMismatch"
          },
          {
            "name": "LockDurationTooSmall"
          },
          {
            "name": "MaxPossibleLockDurationExceeded"
          },
          {
            "name": "NotYetUnlockable"
          }
        ]
      }
    },
    {
      "name": "AccountLoaderStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Uninitialized",
            "fields": [
              {
                "defined": "RefMut<'info,T>"
              }
            ]
          },
          {
            "name": "Initialized",
            "fields": [
              {
                "defined": "RefMut<'info,T>"
              }
            ]
          }
        ]
      }
    }
  ]
};
