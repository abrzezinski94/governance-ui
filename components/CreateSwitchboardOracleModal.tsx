import { SwitchboardProgram } from '@switchboard-xyz/solana.js'
import { QueueAccount } from '@switchboard-xyz/solana.js'
import { OracleJob } from '@switchboard-xyz/common'
import useWalletStore from 'stores/useWalletStore'
import Modal from './Modal'
import Button from './Button'
import useWalletOnePointOh from '@hooks/useWalletOnePointOh'

const CreateSwitchboardOracleModal = ({ isOpen, onClose }) => {
  const connection = useWalletStore((s) => s.connection)
  const wallet = useWalletOnePointOh()

  const create = async () => {
    const payer = wallet!.publicKey!

    const program = await SwitchboardProgram.load(
      connection.cluster === 'devnet' ? 'devnet' : 'mainnet-beta',
      connection.current
    )
    const [queueAccount, txObject] = await QueueAccount.createInstructions(
      program,
      payer,
      {
        name: 'My Queue',
        metadata: 'Top Secret',
        queueSize: 100,
        reward: 0.00001337,
        minStake: 10,
        oracleTimeout: 60,
        slashingEnabled: false,
        unpermissionedFeeds: true,
        unpermissionedVrf: true,
        enableBufferRelayers: false,
      }
    )
    console.log(queueAccount, txObject)
    const [
      oracleAccount,
      txArray,
    ] = await queueAccount.createOracleInstructions(payer, {
      name: 'My Oracle',
      metadata: 'Oracle #1',
      stakeAmount: 10,
      queueAuthorityPubkey: wallet!.publicKey!,
    })

    const [
      aggregatorAccount,
      txArray1,
    ] = await queueAccount.createFeedInstructions(payer, {
      name: 'SOL_USD',
      batchSize: 1,
      minRequiredOracleResults: 1,
      minRequiredJobResults: 1,
      minUpdateDelaySeconds: 10,
      queueAuthorityPubkey: wallet!.publicKey!,
      fundAmount: 0.5,
      enable: true,
      jobs: [
        {
          weight: 2,
          data: OracleJob.encodeDelimited(
            OracleJob.fromObject({
              tasks: [
                {
                  conditionalTask: {
                    attempt: [
                      {
                        cacheTask: {
                          cacheItems: [
                            {
                              variableName: 'DUAL_QTY',
                              job: {
                                tasks: [
                                  {
                                    valueTask: {
                                      big: '100',
                                    },
                                  },
                                  {
                                    divideTask: {
                                      job: {
                                        tasks: [
                                          {
                                            serumSwapTask: {
                                              serumPoolAddress:
                                                'H6rrYK3SUHF2eguZCyJxnSBMJqjXhUtuaki6PHiutvum',
                                            },
                                          },
                                        ],
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      {
                        jupiterSwapTask: {
                          inTokenAddress:
                            'DUALa4FC2yREwZ59PHeu1un4wis36vHRv5hWVBmzykCJ',
                          outTokenAddress:
                            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                          baseAmountString: '${DUAL_QTY}',
                        },
                      },
                      {
                        divideTask: {
                          big: '${DUAL_QTY}',
                        },
                      },
                    ],
                    onFailure: [
                      {
                        lpExchangeRateTask: {
                          orcaPoolAddress:
                            '7yJ4gMRJhEoCR48aPE3EAWRmCoygakik81ZS1sajaTnE',
                        },
                      },
                    ],
                  },
                },
                {
                  conditionalTask: {
                    attempt: [
                      {
                        valueTask: {
                          big: '100',
                        },
                      },
                      {
                        divideTask: {
                          job: {
                            tasks: [
                              {
                                jupiterSwapTask: {
                                  inTokenAddress:
                                    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                                  outTokenAddress:
                                    'DUALa4FC2yREwZ59PHeu1un4wis36vHRv5hWVBmzykCJ',
                                  baseAmountString: '100',
                                },
                              },
                            ],
                          },
                        },
                      },
                    ],
                    onFailure: [
                      {
                        lpExchangeRateTask: {
                          orcaPoolAddress:
                            '7yJ4gMRJhEoCR48aPE3EAWRmCoygakik81ZS1sajaTnE',
                        },
                      },
                    ],
                  },
                },
              ],
            })
          ).finish(),
        },
      ],
    })
    console.log({
      queueAccount,
      oracleAccount,
      aggregatorAccount,
      tx: [txObject, ...txArray, ...txArray1],
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div>
        <Button onClick={create}></Button>
      </div>
    </Modal>
  )
}

export default CreateSwitchboardOracleModal
