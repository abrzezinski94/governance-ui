import React, { useEffect, useState } from 'react'
import useTreasuryAccountStore from 'stores/useTreasuryAccountStore'
import { ViewState } from './Types'
import { ArrowLeftIcon } from '@heroicons/react/solid'
import AccountLabel from './AccountHeader'
import Input from '@components/inputs/Input'
import { tryParseKey } from '@tools/validators/pubkey'
import { debounce } from '@utils/debounce'
import useWalletStore from 'stores/useWalletStore'
import { Metadata } from '@metaplex-foundation/mpl-token-metadata'
import axios from 'axios'
import { notify } from '@utils/notifications'
import Loading from '@components/Loading'
import Button, { LinkButton, SecondaryButton } from '@components/Button'
import { PublicKey } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import Tooltip from '@components/Tooltip'
import { tryGetAta } from '@utils/validations'
import useRealm from '@hooks/useRealm'
import { createATA } from '@utils/ataTools'
import { abbreviateAddress } from '@utils/formatting'
import DepositLabel from './DepositLabel'

const DepositNFT = () => {
  const {
    setCurrentCompactView,
    resetCompactViewState,
  } = useTreasuryAccountStore()
  const currentAccount = useTreasuryAccountStore(
    (s) => s.compact.currentAccount
  )

  const wallet = useWalletStore((s) => s.current)
  const { realm } = useRealm()
  const connection = useWalletStore((s) => s.connection)
  const connected = useWalletStore((s) => s.connected)
  const [form, setForm] = useState({
    mint: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [nftMetaData, setNftMetaData] = useState<Metadata | null>(null)
  const [isInvalidMint, setIsInvalidMint] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [imgUrl, setImgUrl] = useState('')
  const [ataAddress, setAtaAddress] = useState('')
  const handleSetForm = ({ propertyName, value }) => {
    setFormErrors({})
    setForm({ ...form, [propertyName]: value })
  }
  const handleGoBackToMainView = () => {
    setCurrentCompactView(ViewState.MainView)
    resetCompactViewState()
  }
  const handleGenerateATAAddress = async () => {
    setAtaAddress('')
    if (!currentAccount) {
      throw 'No governance selected'
    }
    if (!realm) {
      throw 'no realm selected'
    }
    const mintPK = new PublicKey(form.mint)
    const owner = currentAccount!.governance!.pubkey
    const ataPk = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID, // always ASSOCIATED_TOKEN_PROGRAM_ID
      TOKEN_PROGRAM_ID, // always TOKEN_PROGRAM_ID
      mintPK, // mint
      owner! // owner
    )
    const ata = ataPk.toBase58()
    const isExistingAta = await tryGetAta(connection, mintPK, owner)
    if (!isExistingAta) {
      try {
        await createATA(
          connection.current,
          wallet,
          mintPK,
          owner,
          wallet!.publicKey!
        )
        setAtaAddress(ata)
      } catch (e) {
        notify({
          type: 'error',
          message: 'Unable to create address',
        })
        setAtaAddress('')
      }
    } else {
      setAtaAddress(ata)
    }
  }
  useEffect(() => {
    setIsInvalidMint(false)
    if (form.mint) {
      debounce.debounceFcn(async () => {
        const pubKey = tryParseKey(form.mint)
        if (pubKey) {
          setIsLoading(true)
          try {
            const metadataPDA = await Metadata.getPDA(pubKey)
            const tokenMetadata = await Metadata.load(
              connection.current,
              metadataPDA
            )
            setNftMetaData(tokenMetadata)
          } catch (e) {
            notify({
              type: 'error',
              message: 'Unable to fetch nft',
            })
            setNftMetaData(null)
          }
          setIsLoading(false)
        } else {
          setIsInvalidMint(true)
          setNftMetaData(null)
        }
      })
    } else {
      setNftMetaData(null)
    }
  }, [form.mint])
  useEffect(() => {
    const uri = nftMetaData?.data?.data?.uri
    const getNftData = async (uri) => {
      if (uri) {
        setIsLoading(true)
        try {
          const nftResponse = (await axios.get(uri)).data
          setImgUrl(nftResponse.image)
        } catch (e) {
          notify({
            type: 'error',
            message: 'Unable to fetch nft',
          })
        }
        setIsLoading(false)
      } else {
        setImgUrl('')
      }
    }
    setAtaAddress('')
    getNftData(uri)
  }, [JSON.stringify(nftMetaData)])
  return (
    <>
      <h3 className="mb-4 flex items-center">
        <>
          <ArrowLeftIcon
            onClick={() => setCurrentCompactView(ViewState.DepositNFTOptions)}
            className="h-4 w-4 mr-1 text-primary-light mr-2 hover:cursor-pointer"
          />
          Deposit
        </>
      </h3>
      <AccountLabel></AccountLabel>
      <DepositLabel currentAccount={currentAccount}></DepositLabel>
      <div className="space-y-4 w-full pb-4">
        <div className="text-sm mt-4">
          <div className="flex flex-row text-xs items-center border border-fgd-4 default-transition rounded-lg px-4 py-2">
            {
              "If your wallet doesn't support sending nfts to shared wallets please generate address using the nft mint"
            }
          </div>
        </div>
        <Input
          label="Mint address"
          value={form.mint}
          type="text"
          onChange={(evt) =>
            handleSetForm({
              value: evt.target.value,
              propertyName: 'mint',
            })
          }
          noMaxWidth={true}
          error={formErrors['mint']}
        />
        {isInvalidMint && (
          <div className="text-xs text-red">Invalid mint address</div>
        )}
        {isLoading ? (
          <Loading />
        ) : (
          imgUrl && (
            <div className="flex justify-center">
              <img style={{ width: '150px' }} src={imgUrl} />
            </div>
          )
        )}
      </div>
      {ataAddress && (
        <div className="bg-bkg-1 px-4 py-2 rounded-md w-full break-all flex items-center mb-4">
          <div>
            <div className="text-fgd-3 text-xs">
              {abbreviateAddress(new PublicKey(ataAddress))}
            </div>
          </div>
          <div className="ml-auto">
            <LinkButton
              className="ml-4 text-th-fgd-1"
              onClick={() => {
                navigator.clipboard.writeText(ataAddress)
              }}
            >
              Copy
            </LinkButton>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
        <SecondaryButton
          className="sm:w-1/2 text-th-fgd-1"
          onClick={handleGoBackToMainView}
        >
          Cancel
        </SecondaryButton>
        <Button
          disabled={isLoading || !imgUrl || !connected}
          className="sm:w-1/2"
          onClick={handleGenerateATAAddress}
          isLoading={isLoading}
        >
          <Tooltip content={!connected && 'Please connect your wallet'}>
            <div>Generate Address</div>
          </Tooltip>
        </Button>
      </div>
    </>
  )
}

export default DepositNFT
