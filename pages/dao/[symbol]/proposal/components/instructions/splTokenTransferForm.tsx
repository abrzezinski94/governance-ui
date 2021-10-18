import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react'
import Input from '@components/inputs/Input'
import Select from '@components/inputs/Select'
import useRealm from '@hooks/useRealm'
import { GovernanceAccountType } from '@models/accounts'
import { Token } from '@solana/spl-token'
import {
  getMintMinAmountAsDecimal,
  parseMintNaturalAmountFromDecimal,
} from '@tools/sdk/units'
import { PublicKey } from '@solana/web3.js'
import { serializeInstructionToBase64 } from '@models/serialisation'
import { precision } from '@utils/formatting'
import * as yup from 'yup'
import { isFormValid } from '@utils/formValidation'
import { validateTokenAccountMint } from '@tools/validators/accounts/token'
import { tryParseKey } from '@tools/validators/pubkey'
import useWalletStore from 'stores/useWalletStore'
import { tryGetTokenAccount, tryGetTokenMint } from '@utils/tokens'

const SplTokenTransferForm = forwardRef((props, ref) => {
  const connection = useWalletStore((s) => s.connection)
  const { realmInfo, governances } = useRealm()
  const programId = realmInfo?.programId
  const [form, setForm] = useState({
    destinationAccount: '',
    amount: 1,
    sourceAccount: null,
    programId: programId?.toString(),
    mintInfo: null,
  })
  const [formErrors, setFormErrors] = useState({})
  const governancesArray = Object.keys(governances).map(
    (key) => governances[key]
  )
  const sourceAccounts = governancesArray
    .filter(
      (gov) => gov.info?.accountType === GovernanceAccountType.TokenGovernance
    )
    .map((x) => x)
  const mintMinAmount = form.mintInfo
    ? getMintMinAmountAsDecimal(form.mintInfo)
    : 1
  const currentPrecision = precision(mintMinAmount)

  const schema = yup.object().shape({
    destinationAccount: yup
      .string()
      .required('Destination account is required')
      .test(
        'destinationAccount',
        "Account mint doesn't match source account",
        async (val) => {
          const pubkey = tryParseKey(val)
          try {
            if (pubkey) {
              const [destAccMint, sourceAccMint] = await Promise.all([
                tryGetTokenAccount(connection.current, pubkey),
                tryGetTokenAccount(
                  connection.current,
                  form.sourceAccount.info.governedAccount
                ),
              ])
              validateTokenAccountMint(destAccMint, sourceAccMint.account.mint)
              return true
            }
          } catch (e) {
            return false
          }
          return false
        }
      ),
    amount: yup.string().required('Amount is required'),
    sourceAccount: yup
      .object()
      .nullable()
      .required('Source account is required'),
  })
  const handleSetForm = ({ propertyName, value }) => {
    setFormErrors({})
    setForm({ ...form, [propertyName]: value })
  }
  const setMintInfo = (value) => {
    setForm({ ...form, mintInfo: value })
  }
  const setamount = (event) => {
    const { min, max } = event.target
    let value = event.target.value
    value = !value
      ? ''
      : Math.max(Number(min), Math.min(Number(max), Number(value))).toFixed(
          currentPrecision
        )
    handleSetForm({
      value: value,
      propertyName: 'amount',
    })
  }
  const validateInstruction = async () => {
    const { isValid, validationErrors } = await isFormValid(schema, form)
    setFormErrors(validationErrors)
    return isValid
  }
  const getSerializedInstruction = async () => {
    const isValid = await validateInstruction()
    let serializedInstruction = ''
    if (isValid) {
      const mintAmount = parseMintNaturalAmountFromDecimal(
        form.amount,
        mintMinAmount
      )
      const transferIx = Token.createTransferInstruction(
        programId,
        form.sourceAccount?.pubkey,
        new PublicKey(form.destinationAccount),
        form.sourceAccount?.info?.governedAccount,
        [],
        mintAmount
      )
      serializedInstruction = serializeInstructionToBase64(transferIx)
    }
    return {
      serializedInstruction,
      isValid,
      sourceAccount: form.sourceAccount,
    }
  }

  useEffect(() => {
    handleSetForm({
      propertyName: 'programId',
      value: programId?.toString(),
    })
  }, [realmInfo?.programId])
  useEffect(() => {
    async function tryGetTooknAccount() {
      const mintResponse = await tryGetTokenMint(
        connection.current,
        form.sourceAccount?.info.governedAccount
      )
      setMintInfo(mintResponse.account)
    }
    if (form.sourceAccount?.info.governedAccount) {
      tryGetTooknAccount()
    }
  }, [form.sourceAccount?.pubkey])
  useImperativeHandle(ref, () => ({
    getSerializedInstruction,
  }))

  return (
    <div className="mt-5">
      <div>Program id</div>
      <div>{form.programId}</div>
      <div>Account owner (governance account)</div>
      <div>{form.sourceAccount?.pubkey?.toString()}</div>
      <Select
        prefix="Source Account"
        onChange={(value) =>
          handleSetForm({ value, propertyName: 'sourceAccount' })
        }
        value={form.sourceAccount?.info?.governedAccount?.toString()}
        error={formErrors['sourceAccount']}
      >
        {sourceAccounts.map((acc) => {
          const govAccount = acc.pubkey.toString()
          return (
            <Select.Option key={govAccount} value={acc}>
              <span>{acc.info.governedAccount.toString()}</span>
            </Select.Option>
          )
        })}
      </Select>
      <Input
        prefix="Destination account"
        value={form.destinationAccount}
        type="text"
        onChange={(evt) =>
          handleSetForm({
            value: evt.target.value,
            propertyName: 'destinationAccount',
          })
        }
        error={formErrors['destinationAccount']}
      />
      <Input
        min={mintMinAmount}
        prefix="Amount"
        value={form.amount}
        type="number"
        onChange={setamount}
        step={mintMinAmount}
        error={formErrors['amount']}
      />
    </div>
  )
})

export default SplTokenTransferForm
