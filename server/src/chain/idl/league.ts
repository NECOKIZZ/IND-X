/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/league.json`.
 */
export type League = {
  "address": "8d88mxfH12NXWg9RfvkpFXztGBAkYMsbNxAXyfvwT3uA",
  "metadata": {
    "name": "league",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Weekly stock-basket league on Solana: beat MEDIAN"
  },
  "instructions": [
    {
      "name": "boostRound",
      "docs": [
        "Add a sponsor boost to a round's pot (anyone, before settlement starts)."
      ],
      "discriminator": [
        150,
        144,
        139,
        149,
        214,
        207,
        236,
        35
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "userStake",
          "writable": true
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claim",
      "docs": [
        "Claim the payout (or the refund of a void round). Closes the entry",
        "once any basket has gone back too."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "userStake",
          "writable": true
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "enterBacker",
      "docs": [
        "Back a creator's team with one ticket."
      ],
      "discriminator": [
        180,
        107,
        191,
        168,
        93,
        49,
        178,
        253
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "team",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              },
              {
                "kind": "arg",
                "path": "teamKey"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "userStake",
          "writable": true
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        },
        {
          "name": "teamKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "enterCreator",
      "docs": [
        "Enter as a creator: lock a basket plus one ticket. Remaining accounts,",
        "per leg in `weights` order: [mint, user token account, vault].",
        "The first creator with `team_key` becomes its captain (and names the",
        "ETF); a later creator with the same key joins that team as a clone."
      ],
      "discriminator": [
        194,
        98,
        11,
        127,
        159,
        89,
        142,
        192
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "team",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              },
              {
                "kind": "arg",
                "path": "teamKey"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "userStake",
          "writable": true
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "docs": [
            "The stake mint's token program (classic Token for USDC)."
          ]
        },
        {
          "name": "basketTokenProgram",
          "docs": [
            "The basket tokens' program (Token-2022 for xStocks; may equal token_program)."
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        },
        {
          "name": "teamKey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "amounts",
          "type": {
            "vec": "u64"
          }
        },
        {
          "name": "weights",
          "type": {
            "vec": "u16"
          }
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "buyFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "fundSeason",
      "docs": [
        "Seed the season pot (used for thin-pot top-ups). Anyone can."
      ],
      "discriminator": [
        251,
        186,
        193,
        242,
        15,
        144,
        254,
        67
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "userStake",
          "writable": true
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "stakeMint"
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "openRound",
      "discriminator": [
        66,
        235,
        123,
        240,
        8,
        35,
        185,
        159
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "entryClose",
          "type": "i64"
        },
        {
          "name": "end",
          "type": "i64"
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "capMultiple",
          "type": "u16"
        },
        {
          "name": "maxBackers",
          "type": "u16"
        }
      ]
    },
    {
      "name": "returnBasket",
      "docs": [
        "Send locked basket tokens back to their owner once the round is over.",
        "Anyone can call it (the tokens only ever go to the owner). Remaining",
        "accounts, per leg to return: [mint, vault, owner's token account].",
        "Legs can be returned in several calls (e.g. if one token is paused)."
      ],
      "discriminator": [
        160,
        132,
        169,
        200,
        15,
        223,
        113,
        168
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        },
        {
          "name": "entry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "basketTokenProgram"
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setAdmin",
      "discriminator": [
        251,
        163,
        0,
        52,
        91,
        194,
        187,
        92
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "admin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setAsset",
      "docs": [
        "Allow (or disable) a token in baskets, creating its vault if needed."
      ],
      "discriminator": [
        243,
        216,
        48,
        30,
        63,
        58,
        91,
        239
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "enabled",
          "type": "bool"
        },
        {
          "name": "isCrypto",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setKeeper",
      "discriminator": [
        102,
        94,
        23,
        78,
        157,
        222,
        243,
        214
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "keeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settleBegin",
      "docs": [
        "Commit the settlement totals. Conservation is checked here; the",
        "per-entry payouts that follow must add up to `total_payout`."
      ],
      "discriminator": [
        31,
        202,
        83,
        102,
        208,
        102,
        124,
        127
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        },
        {
          "name": "totalPayout",
          "type": "u64"
        },
        {
          "name": "platformCut",
          "type": "u64"
        },
        {
          "name": "seasonIn",
          "type": "u64"
        },
        {
          "name": "seasonOut",
          "type": "u64"
        },
        {
          "name": "inputsHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "settleFinish",
      "docs": [
        "Finish once every entry has its payout and they add up."
      ],
      "discriminator": [
        164,
        205,
        77,
        145,
        190,
        129,
        22,
        47
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleWrite",
      "docs": [
        "Write payouts for a batch of entries (remaining accounts, writable),",
        "in any order. Rewriting an entry in the same epoch replaces its payout."
      ],
      "discriminator": [
        48,
        213,
        54,
        61,
        33,
        145,
        235,
        82
      ],
      "accounts": [
        {
          "name": "keeper",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        },
        {
          "name": "payouts",
          "type": {
            "vec": "u64"
          }
        }
      ]
    },
    {
      "name": "voidRound",
      "docs": [
        "Void a round: everyone gets their stake and basket back. Keeper/admin",
        "any time before it is settled (bad prices, outage); anyone once",
        "VOID_GRACE has passed after the end."
      ],
      "discriminator": [
        102,
        72,
        126,
        187,
        12,
        18,
        16,
        96
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "round",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  117,
                  110,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "roundId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "roundId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawPlatform",
      "discriminator": [
        87,
        237,
        31,
        212,
        241,
        172,
        99,
        33
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stakeMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "stakeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "stakeMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "entry",
      "discriminator": [
        63,
        18,
        152,
        113,
        215,
        246,
        221,
        250
      ]
    },
    {
      "name": "registry",
      "discriminator": [
        47,
        174,
        110,
        246,
        184,
        182,
        252,
        218
      ]
    },
    {
      "name": "round",
      "discriminator": [
        87,
        127,
        165,
        51,
        73,
        78,
        116,
        174
      ]
    },
    {
      "name": "team",
      "discriminator": [
        140,
        218,
        177,
        140,
        193,
        241,
        199,
        106
      ]
    }
  ],
  "events": [
    {
      "name": "assetSet",
      "discriminator": [
        175,
        84,
        64,
        85,
        102,
        200,
        50,
        40
      ]
    },
    {
      "name": "backerEntered",
      "discriminator": [
        31,
        151,
        176,
        216,
        55,
        87,
        115,
        185
      ]
    },
    {
      "name": "basketReturned",
      "discriminator": [
        252,
        109,
        213,
        133,
        150,
        16,
        225,
        97
      ]
    },
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "creatorEntered",
      "discriminator": [
        164,
        112,
        128,
        189,
        186,
        120,
        52,
        163
      ]
    },
    {
      "name": "roundBoosted",
      "discriminator": [
        150,
        230,
        122,
        105,
        145,
        120,
        25,
        113
      ]
    },
    {
      "name": "roundOpened",
      "discriminator": [
        99,
        173,
        228,
        72,
        142,
        57,
        109,
        178
      ]
    },
    {
      "name": "roundSettled",
      "discriminator": [
        249,
        225,
        66,
        54,
        157,
        200,
        234,
        222
      ]
    },
    {
      "name": "roundVoided",
      "discriminator": [
        236,
        16,
        226,
        252,
        168,
        201,
        103,
        69
      ]
    },
    {
      "name": "seasonFunded",
      "discriminator": [
        86,
        2,
        211,
        175,
        10,
        250,
        20,
        35
      ]
    },
    {
      "name": "teamCreated",
      "discriminator": [
        172,
        52,
        201,
        62,
        192,
        159,
        66,
        49
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notAdmin",
      "msg": "Only the admin can do this"
    },
    {
      "code": 6001,
      "name": "notKeeper",
      "msg": "Only the keeper or admin can do this"
    },
    {
      "code": 6002,
      "name": "paused",
      "msg": "The league is paused"
    },
    {
      "code": 6003,
      "name": "badRound",
      "msg": "Round is not in the right state"
    },
    {
      "code": 6004,
      "name": "badTimes",
      "msg": "Bad round times or parameters"
    },
    {
      "code": 6005,
      "name": "entriesClosed",
      "msg": "Entries are closed"
    },
    {
      "code": 6006,
      "name": "badBasket",
      "msg": "Basket must hold 3-10 distinct allowed tokens with weights summing to 10000"
    },
    {
      "code": 6007,
      "name": "badName",
      "msg": "Name must be 1-32 bytes and the buy fee at most 2%"
    },
    {
      "code": 6008,
      "name": "tokenNotAllowed",
      "msg": "Token is not allowed in baskets"
    },
    {
      "code": 6009,
      "name": "badVault",
      "msg": "Wrong vault account"
    },
    {
      "code": 6010,
      "name": "badTokenAccount",
      "msg": "Wrong token account"
    },
    {
      "code": 6011,
      "name": "noSuchTeam",
      "msg": "No such team in this round"
    },
    {
      "code": 6012,
      "name": "teamFull",
      "msg": "Team is full"
    },
    {
      "code": 6013,
      "name": "tooEarly",
      "msg": "Too early"
    },
    {
      "code": 6014,
      "name": "lengthMismatch",
      "msg": "Length mismatch"
    },
    {
      "code": 6015,
      "name": "notConserved",
      "msg": "Settlement does not conserve the round's money"
    },
    {
      "code": 6016,
      "name": "seasonOverdrawn",
      "msg": "Season pot would go negative"
    },
    {
      "code": 6017,
      "name": "payoutTooLarge",
      "msg": "Payout above the per-entry ceiling"
    },
    {
      "code": 6018,
      "name": "settlementIncomplete",
      "msg": "Not every entry has a payout yet"
    },
    {
      "code": 6019,
      "name": "wrongRound",
      "msg": "Entry belongs to another round"
    },
    {
      "code": 6020,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6021,
      "name": "registryFull",
      "msg": "Registry is full"
    },
    {
      "code": 6022,
      "name": "zeroAmount",
      "msg": "Amount must be positive"
    },
    {
      "code": 6023,
      "name": "insufficientBalance",
      "msg": "Not enough platform balance"
    },
    {
      "code": 6024,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "asset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "isCrypto",
            "docs": [
              "Crypto (wrapped BTC, ETH, SOL…): capped as a slice of the basket."
            ],
            "type": "bool"
          },
          {
            "name": "enabled",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "assetSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "isCrypto",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "backerEntered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "teamKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "index",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "basketReturned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Program-wide settings. Its PDA also owns every vault: the ticket vault",
        "(stake mint) and one basket vault per allowed stock token."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "roundCount",
            "type": "u64"
          },
          {
            "name": "seasonPot",
            "docs": [
              "Season pot: half the take, used to top up thin pots."
            ],
            "type": "u64"
          },
          {
            "name": "platformBalance",
            "docs": [
              "Platform's half of the take, withdrawable by the admin."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "creatorEntered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "teamKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "captain",
            "type": "bool"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "amounts",
            "type": {
              "vec": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "entry",
      "docs": [
        "A wallet's place in a round. Closed (rent back to the wallet) once the",
        "payout is claimed and any basket has gone back."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "teamKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "index",
            "docs": [
              "Order of entry: settlement payouts are written in this order."
            ],
            "type": "u32"
          },
          {
            "name": "isCreator",
            "type": "bool"
          },
          {
            "name": "payoutEpoch",
            "docs": [
              "settle_epoch under which `payout` was written (0 = never)."
            ],
            "type": "u32"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "basket",
            "type": {
              "vec": {
                "defined": {
                  "name": "locked"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "leg",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "weightBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "locked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Base units actually received by the vault."
            ],
            "type": "u64"
          },
          {
            "name": "weightBps",
            "type": "u16"
          },
          {
            "name": "returned",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "registry",
      "docs": [
        "The tokens a basket may hold."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assets",
            "type": {
              "vec": {
                "defined": {
                  "name": "asset"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "round",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "roundStatus"
              }
            }
          },
          {
            "name": "entryClose",
            "docs": [
              "Entries rejected at/after this time (unix seconds)."
            ],
            "type": "i64"
          },
          {
            "name": "end",
            "docs": [
              "Settlement allowed at/after this time."
            ],
            "type": "i64"
          },
          {
            "name": "stake",
            "docs": [
              "Fixed ticket, stake-mint base units."
            ],
            "type": "u64"
          },
          {
            "name": "capMultiple",
            "docs": [
              "Max team gain = cap_multiple × team stake."
            ],
            "type": "u16"
          },
          {
            "name": "maxBackers",
            "docs": [
              "Per team, captain excluded."
            ],
            "type": "u16"
          },
          {
            "name": "entryCount",
            "type": "u32"
          },
          {
            "name": "teamCount",
            "type": "u32"
          },
          {
            "name": "totalStakes",
            "type": "u64"
          },
          {
            "name": "bonus",
            "docs": [
              "Sponsor boosts (and later ticket yield) added to the winners' pot."
            ],
            "type": "u64"
          },
          {
            "name": "inputsHash",
            "docs": [
              "Hash of the published settlement inputs: anyone can recompute payouts."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "totalPayout",
            "type": "u64"
          },
          {
            "name": "platformCut",
            "type": "u64"
          },
          {
            "name": "seasonIn",
            "type": "u64"
          },
          {
            "name": "seasonOut",
            "type": "u64"
          },
          {
            "name": "settleEpoch",
            "docs": [
              "Bumped by every settle_begin: payouts written under an older epoch",
              "don't count, so the keeper can restart a settlement cleanly."
            ],
            "type": "u32"
          },
          {
            "name": "writtenCount",
            "type": "u32"
          },
          {
            "name": "writtenSum",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "roundBoosted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "by",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "roundOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "entryClose",
            "type": "i64"
          },
          {
            "name": "end",
            "type": "i64"
          },
          {
            "name": "stake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "roundSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "inputsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "totalPayout",
            "type": "u64"
          },
          {
            "name": "platformCut",
            "type": "u64"
          },
          {
            "name": "seasonIn",
            "type": "u64"
          },
          {
            "name": "seasonOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "roundStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "settling"
          },
          {
            "name": "settled"
          },
          {
            "name": "voided"
          }
        ]
      }
    },
    {
      "name": "roundVoided",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "seasonFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "team",
      "docs": [
        "One ETF. The first creator with a team key is the captain; a later creator",
        "with the same key (a clone: same stocks, same weights to 1%) joins the team."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "key",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "captain",
            "type": "pubkey"
          },
          {
            "name": "members",
            "docs": [
              "Non-captain members: clones and backers."
            ],
            "type": "u16"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "buyFeeBps",
            "docs": [
              "Fee (bps) the creator earns when someone buys the ETF through the app."
            ],
            "type": "u16"
          },
          {
            "name": "legs",
            "type": {
              "vec": {
                "defined": {
                  "name": "leg"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "teamCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundId",
            "type": "u64"
          },
          {
            "name": "teamKey",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "captain",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "buyFeeBps",
            "type": "u16"
          }
        ]
      }
    }
  ]
};
