import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/outline'
import useProposal from '../../../../hooks/useProposal'
import TokenBalanceCard from '../../../../components/TokenBalanceCard'
import useRealm from '../../../../hooks/useRealm'
import { option } from '../../../../tools/core/option'
import useRealmContext from '../../../../hooks/useRealmContext'

const New = () => {
  const { urlContext } = useRealmContext()
  const { symbol } = useRealm()
  const { proposal } = useProposal()
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="bg-bkg-2 border border-bkg-3 rounded-lg p-6 col-span-8 space-y-3">
        <>
          <Link href={`/${urlContext}/${symbol}/`}>
            <a className="flex items-center text-fgd-3 text-sm transition-all hover:text-fgd-1">
              <ArrowLeftIcon className="h-4 w-4 mr-1 text-primary-light" />
              Back
            </a>
          </Link>
        </>
      </div>
      <div className="col-span-4 space-y-4">
        <TokenBalanceCard proposal={option(proposal?.info)} />
      </div>
    </div>
  )
}

export default New
