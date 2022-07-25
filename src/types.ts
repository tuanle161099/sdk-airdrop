import { DistributorData } from '@sentre/utility'
import { BN } from '@project-serum/anchor'

export type RecipientInfo = {
  walletAddress: string
  decimalAmount: string
  unlockTime: number
}

export type WrapDistributorData = DistributorData & {
  distributorAddress: string
}

export type AirdropReceivedData = {
  source: string
  mint: string
  distributorAddress: string
  amount: BN
  unlockTime: BN
  destination: string
  salt: Buffer
}
