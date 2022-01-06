import { PublicKey } from '@solana/web3.js'
import { GovernedTokenAccount } from '@utils/tokens'
import { abbreviateAddress } from '@utils/formatting'
import useWalletStore from '../../stores/useWalletStore'
import useTreasuryAccountStore from 'stores/useTreasuryAccountStore'
import { ViewState } from './Types'
import { useEffect, useState } from 'react'
import { getParsedNftAccountsByOwner } from '@nfteyez/sol-rayz'
const AccountItemNFT = ({
  governedAccountTokenAccount,
  className,
  onClick,
}: {
  governedAccountTokenAccount: GovernedTokenAccount
  className?: string
  onClick?: () => void
}) => {
  const connection = useWalletStore((s) => s.connection)
  const [nftsCount, setNftsCount] = useState(0)
  const {
    setCurrentCompactView,
    setCurrentCompactAccount,
  } = useTreasuryAccountStore()

  const accountPublicKey = governedAccountTokenAccount
    ? governedAccountTokenAccount.governance?.pubkey
    : null
  //TODO move to outside component
  async function handleGoToAccountOverview() {
    setCurrentCompactView(ViewState.AccountView)
    setCurrentCompactAccount(governedAccountTokenAccount, connection)
  }
  useEffect(() => {
    const getNftsCount = async () => {
      const nfts = await getParsedNftAccountsByOwner({
        publicAddress: accountPublicKey,
        connection: connection.current,
      })
      setNftsCount(nfts.length)
    }
    getNftsCount()
  }, [])
  return (
    <div
      onClick={onClick ? onClick : handleGoToAccountOverview}
      className={`cursor-pointer default-transition flex items-start text-fgd-1 border border-fgd-4 p-3 rounded-lg w-full hover:bg-bkg-3 ${
        className && className
      }`}
    >
      <img
        src="/img/collectablesIcon.svg"
        className="flex-shrink-0 h-5 w-5 mr-2.5 mt-1"
      />
      <div className="w-full">
        <div className="flex items-start justify-between mb-1">
          <div className="text-xs text-th-fgd-1">
            {abbreviateAddress(accountPublicKey as PublicKey)}
          </div>
        </div>
        <div className="text-fgd-3 text-xs flex flex-col">{nftsCount} NFTS</div>
      </div>
    </div>
  )
}

export default AccountItemNFT
