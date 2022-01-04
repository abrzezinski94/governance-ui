import create, { State } from 'zustand'
import { ViewState } from '@components/TreasuryAccount/Types'
import { GovernedTokenAccount } from '@utils/tokens'
import tokenService, { TokenRecord } from '@utils/services/token'
import { ConfirmedSignatureInfo } from '@solana/web3.js'
import { notify } from '@utils/notifications'
import { DEFAULT_NFT_TREASURY_MINT } from '@components/instructions/tools'

interface TreasuryAccountStore extends State {
  compact: {
    currentView: ViewState
    currentAccount: GovernedTokenAccount | null
    mintAddress: string
    tokenInfo: TokenRecord | null
    recentActivity: ConfirmedSignatureInfo[]
    nftsCount?: number
  }
  setCurrentCompactView: (viewState: ViewState) => void
  setCurrentCompactAccount: (
    account: GovernedTokenAccount,
    connection,
    nftsCount?
  ) => void
  resetCompactViewState: () => void
  handleFetchRecentActivity: (account: GovernedTokenAccount, connection) => void
}

const compactDefaultState = {
  currentView: ViewState.MainView,
  currentAccount: null,
  mintAddress: '',
  tokenInfo: null,
  recentActivity: [],
  nftsCount: 0,
}

const useTreasuryAccountStore = create<TreasuryAccountStore>((set, _get) => ({
  compact: {
    ...compactDefaultState,
  },
  setCurrentCompactView: (viewState) => {
    set((s) => {
      s.compact.currentView = viewState
    })
  },
  setCurrentCompactAccount: (account, connection, nftsCount = 0) => {
    const mintAddress =
      account && account.token ? account.token.account.mint.toBase58() : ''
    const tokenInfo = tokenService.getTokenInfo(mintAddress)

    set((s) => {
      s.compact.currentAccount = account
      s.compact.mintAddress = mintAddress
      s.compact.tokenInfo = mintAddress && tokenInfo ? tokenInfo : null
      s.compact.nftsCount = nftsCount
    })
    _get().handleFetchRecentActivity(account, connection)
  },
  handleFetchRecentActivity: async (account, connection) => {
    let recentActivity = []
    const isNFT =
      account?.mint?.publicKey.toBase58() === DEFAULT_NFT_TREASURY_MINT
    const address = isNFT
      ? account!.governance!.pubkey
      : account!.governance!.info.governedAccount
    try {
      recentActivity = await connection.current.getConfirmedSignaturesForAddress2(
        address,
        {
          limit: 5,
        },
        'confirmed'
      )
    } catch (e) {
      notify({
        type: 'error',
        message: 'Unable to fetch recent account history',
      })
    }
    set((s) => {
      s.compact.recentActivity = recentActivity
    })
  },
  resetCompactViewState: () => {
    set((s) => {
      s.compact = { ...compactDefaultState }
    })
  },
}))

export default useTreasuryAccountStore
