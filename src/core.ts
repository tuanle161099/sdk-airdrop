import { BN } from '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'
import {
  AnchorWallet,
  DEFAULT_RPC_ENDPOINT,
  FeeOptions,
  isAddress,
  Leaf,
  MerkleDistributor,
  Utility,
} from '@sentre/utility'

import { AirdropReceivedData, RecipientInfo, WrapDistributorData } from 'types'
import { getCID, isRevoke, toUnitTime } from 'utils'
import IPFS from 'ipfs'
import { CID } from 'multiformats'

export class Airdrop {
  private _utility: Utility
  private _ipfs: IPFS = new IPFS()

  constructor(
    wallet: AnchorWallet,
    rpcEndpoint: string = DEFAULT_RPC_ENDPOINT,
    programId: string = DEFAULT_RPC_ENDPOINT,
  ) {
    this._utility = new Utility(wallet, rpcEndpoint, programId)
  }

  private createMerkleTree = (recipients: RecipientInfo[]): Buffer => {
    const balanceTree: Leaf[] = recipients.map(
      ({ decimalAmount, walletAddress, unlockTime }, index) => {
        const unitTime = toUnitTime(unlockTime)
        if (!isAddress(walletAddress))
          throw new Error(`${walletAddress} Invalid address`)

        return {
          authority: new PublicKey(walletAddress),
          amount: new BN(decimalAmount),
          startedAt: new BN(unitTime / 1000),
          salt: MerkleDistributor.salt(index.toString()),
        }
      },
    )

    const merkleDistributor = new MerkleDistributor(balanceTree)
    const dataBuffer = merkleDistributor.toBuffer()
    return dataBuffer
  }

  private getDistributors = async (): Promise<WrapDistributorData[]> => {
    const { account } = this._utility.program
    let bulk: WrapDistributorData[] = []
    const distributors = await account.distributor.all()
    for (const { publicKey, account: distributorData } of distributors) {
      const distributorAddress = publicKey.toBase58()
      const wrapDistributorData = { ...distributorData, distributorAddress }
      bulk.push(wrapDistributorData)
    }
    return bulk
  }

  private getAirdropByOwner = (
    walletAddress: string,
    recipients: Leaf[],
    distributor: WrapDistributorData,
  ) => {
    const myAirdrop: AirdropReceivedData[] = []
    const { distributorAddress, mint, authority: source } = distributor
    for (const recipient of recipients) {
      const { authority, amount, startedAt, salt } = recipient
      if (walletAddress !== authority.toBase58()) continue

      const airdropReceived: AirdropReceivedData = {
        source: source.toBase58(),
        mint: mint.toBase58(),
        distributorAddress,
        amount,
        unlockTime: startedAt,
        destination: authority.toBase58(),
        salt,
      }
      myAirdrop.push(airdropReceived)
    }
    return myAirdrop
  }

  private getMerkleData = async (
    metadata: number[],
  ): Promise<MerkleDistributor> => {
    const cid = await getCID(metadata)
    const data: number[] = await this._ipfs.get(cid)
    const merkleDistributor = MerkleDistributor.fromBuffer(Buffer.from(data))
    return merkleDistributor
  }

  /**
   * Initialize new Airdrop
   * @param recipients Recipient information list.
   * @param tokenAddress Token address to be airdropped
   * @param endedAt Airdrop end time
   * @param freeOption Fee (Optional)
   * @returns { tx, txId, distributorAddress }
   */
  initializeAirdrop = async ({
    recipients,
    tokenAddress,
    endedAt = 0,
    feeOptions,
  }: {
    recipients: RecipientInfo[]
    tokenAddress: string
    endedAt?: number
    feeOptions?: FeeOptions
  }) => {
    const treeData = this.createMerkleTree(recipients)
    const merkleDistributor = MerkleDistributor.fromBuffer(treeData)
    const cid = await this._ipfs.set(treeData.toJSON().data)
    const {
      multihash: { digest },
    } = CID.parse(cid)
    const metadata = Buffer.from(digest)

    const { txId, distributorAddress, tx } =
      await this._utility.initializeDistributor({
        tokenAddress,
        total: merkleDistributor.getTotal(),
        merkleRoot: merkleDistributor.deriveMerkleRoot(),
        metadata,
        endedAt: endedAt / 1000,
        feeOptions,
      })

    return { tx, txId, distributorAddress }
  }

  /**
   * Get list airdrop received
   * @param walletAddress The wallet address of the person receiving the token
   * @returns List airdrop received
   */
  getRedeemListByAddress = async ({
    walletAddress,
  }: {
    walletAddress: string
  }): Promise<AirdropReceivedData[]> => {
    if (!isAddress(walletAddress))
      throw new Error(`${walletAddress} Invalid address`)
    const distributors = await this.getDistributors()
    let listAirdropReceived: AirdropReceivedData[] = []
    for (const distributor of distributors) {
      const { metadata } = distributor
      const merkleDistributor = await this.getMerkleData(metadata)
      const recipients = merkleDistributor.receipients
      console.log(recipients, 'recipients')
      const myRecipient = this.getAirdropByOwner(
        walletAddress,
        recipients,
        distributor,
      )
      listAirdropReceived = listAirdropReceived.concat(myRecipient)
    }
    return listAirdropReceived
  }

  /**
   * Get list airdrop sent
   * @param walletAddress The wallet address of the person sending the token
   * @returns List airdrop sent
   */
  getSentAirdropByAddress = async ({
    walletAddress,
  }: {
    walletAddress: string
  }) => {
    const distributors = await this.getDistributors()
    const listAirdropSent: WrapDistributorData[] = []
    for (const distributor of distributors) {
      const authority = distributor.authority.toBase58()
      if (authority !== walletAddress) continue
      listAirdropSent.push(distributor)
    }
    return listAirdropSent
  }

  /**
   * Claim token
   * @param distributorAddress The distributor address of airdrop
   * @param walletAddress The wallet address of the person claim token
   * @param feeOptions Fee (Optional)
   * @returns { tx, txId, dstAddress }
   */
  claim = async ({
    distributorAddress,
    walletAddress,
    feeOptions,
  }: {
    distributorAddress: string
    walletAddress: string
    feeOptions?: FeeOptions
  }) => {
    const airdropsReceived = await this.getRedeemListByAddress({
      walletAddress,
    })
    const distributors = await this.getDistributors()

    const distributorData = distributors.find(
      (distributor) => distributor.distributorAddress === distributorAddress,
    )
    if (!distributorData) throw new Error('Distributor not found!')

    const airdropData = airdropsReceived.find(
      (airdrop) => airdrop.distributorAddress === distributorAddress,
    )
    if (!airdropData) throw new Error('You are not in the list!')

    const { amount, destination, unlockTime, salt } = airdropData
    const recipientData: Leaf = {
      amount: amount,
      authority: new PublicKey(destination),
      startedAt: unlockTime,
      salt,
    }

    const merkle = await this.getMerkleData(distributorData.metadata)
    const proof = merkle.deriveProof(recipientData)
    const validProof = merkle.verifyProof(proof, recipientData)
    if (!validProof) throw new Error('Invalid merkle proof!')

    const { txId, tx, dstAddress } = await this._utility.claim({
      distributorAddress,
      proof,
      data: recipientData,
      feeOptions,
    })

    return { txId, tx, dstAddress }
  }

  /**
   * Revoke token
   * @param distributorAddress The distributor address will be revoked
   * @param feeOptions Fee (Optional)
   * @returns { tx, txId, dstAddress }
   */
  revoke = async ({
    distributorAddress,
    feeOptions,
  }: {
    distributorAddress: string
    feeOptions?: FeeOptions
  }) => {
    const distributors = await this.getDistributors()
    const distributorData = distributors.find(
      (distributor) => distributor.distributorAddress === distributorAddress,
    )
    if (!distributorData) throw new Error('Distributor not found!')
    const { endedAt } = distributorData
    if (!isRevoke(endedAt))
      throw new Error('You cannot revoke, something went wrong!')
    const { tx, txId, dstAddress } = await this._utility.revoke({
      distributorAddress,
      feeOptions,
    })

    return { tx, txId, dstAddress }
  }
}
