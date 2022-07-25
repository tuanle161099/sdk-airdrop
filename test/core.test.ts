import {
  Wallet,
  web3,
  AnchorProvider,
  Program,
  SplToken,
  BN,
} from '@project-serum/anchor'
import { program as getSplProgram } from '@project-serum/anchor/dist/cjs/spl/token'
import { createMintAndMintTo } from '@sen-use/web3'
import {
  DEFAULT_RPC_ENDPOINT,
  DEFAULT_SEN_UTILITY_IDL,
  Utility,
} from '@sentre/utility'
import { Airdrop, RecipientInfo } from '../dist'

const PRIV_KEY_FOR_TEST_ONLY = Buffer.from([
  2, 178, 226, 192, 204, 173, 232, 36, 247, 215, 203, 12, 177, 251, 254, 243,
  92, 38, 237, 60, 38, 248, 213, 19, 73, 180, 31, 164, 63, 210, 172, 90, 85,
  215, 166, 105, 84, 194, 133, 92, 34, 27, 39, 2, 158, 57, 64, 226, 198, 222,
  25, 127, 150, 87, 141, 234, 34, 239, 139, 107, 155, 32, 47, 199,
])

describe('Airdrop sdk core', () => {
  const wallet = new Wallet(web3.Keypair.fromSecretKey(PRIV_KEY_FOR_TEST_ONLY))
  const alice = new Wallet(new web3.Keypair())
  const bob = new Wallet(new web3.Keypair())
  const carol = new Wallet(new web3.Keypair())
  const recipients: RecipientInfo[] = [
    {
      walletAddress: alice.publicKey.toBase58(),
      decimalAmount: '100000000',
      unlockTime: 0,
    },
    {
      walletAddress: bob.publicKey.toBase58(),
      decimalAmount: '200000000',
      unlockTime: 0,
    },
    {
      walletAddress: carol.publicKey.toBase58(),
      decimalAmount: '300000000',
      unlockTime: 0,
    },
  ]
  let airdrop: Airdrop,
    splProgram: Program<SplToken>,
    token: web3.Keypair,
    dstAddress: string

  before(async () => {
    const { program } = new Utility(
      wallet,
      DEFAULT_RPC_ENDPOINT,
      'AKTU61s8NJ8zJATQiceREdhXbedRnKrd1BVgnCuxmD2F',
    )
    console.log(program.programId.toBase58())

    const provider = program.provider as AnchorProvider
    splProgram = getSplProgram(provider)
    token = new web3.Keypair()

    // Init a token
    await createMintAndMintTo(provider, {
      amount: new BN(10000000000),
      mint: token,
    })
  })

  it('constructor', async () => {
    airdrop = new Airdrop(wallet)
  })

  // it('initialize airdrop', async () => {
  //   const { distributorAddress } = await airdrop.initializeAirdrop({
  //     recipients,
  //     tokenAddress: token.publicKey.toBase58(),
  //   })
  //   dstAddress = distributorAddress
  //   console.log(distributorAddress, 'distributorAddress')
  // })

  it('get redeem list by address', async () => {
    const listAirdropReceived = await airdrop.getRedeemListByAddress({
      walletAddress: alice.publicKey.toBase58(),
    })
    console.log(listAirdropReceived, 'listAirdropReceived')
  })

  it('get sent airdrop by address', async () => {
    const listAirdropSent = await airdrop.getSentAirdropByAddress({
      walletAddress: wallet.publicKey.toBase58(),
    })
    console.log(listAirdropSent, 'listAirdropSent')
  })

  it('Claim Token', async () => {
    const { txId } = await airdrop.claim({
      distributorAddress: dstAddress,
      walletAddress: alice.publicKey.toBase58(),
    })
    console.log(txId, 'Claim successfully')
  })
})
