import { JsonRpcProvider, Provider, Wallet } from "ethers";
import {
  BlockReceiptCollection,
  Config,
  TransactionBatch,
  TransactionResultPerHash,
  TransactionSigned,
  TX_KIND_COMMON,
  TX_KIND_ERC20_TRANSFER,
  TX_KIND_PIX_CASH_IN
} from "./types";
import { prepareSignedTxs } from "./preparer";
import { createEmptyBlockReceiptCollection, defineTransactionResults } from "./analyzer";

export class Context {
  readonly config: Config;
  readonly startTime: Date;
  provider: Provider;
  startUpBlockNumber: number;
  firstSendingBlockNumber: number;
  txs: TransactionSigned[];
  txBatches: TransactionBatch[];
  txResults: TransactionResultPerHash;
  blockReceiptCollection: BlockReceiptCollection;
  wallet: Wallet;
  txTotal: number;
  sentTxCount: number;

  constructor(config: Config) {
    this.config = config;
    this.startTime = new Date(Date.now());
    this.provider = new JsonRpcProvider();
    this.startUpBlockNumber = 0;
    this.firstSendingBlockNumber = 0;
    this.txs = [];
    this.txBatches = [];
    this.wallet = new Wallet("0x1111111111111111111111111111111111111111111111111111111111111111");
    this.txTotal = 0;
    this.sentTxCount = 0;
    this.txResults = new Map();
    this.blockReceiptCollection = createEmptyBlockReceiptCollection();
  }

  checkConfig() {
    if (
      this.config.txKind !== TX_KIND_COMMON &&
      this.config.txKind !== TX_KIND_ERC20_TRANSFER &&
      this.config.txKind !== TX_KIND_PIX_CASH_IN
    ) {
      throw new Error(`The configured kind of transactions is not supported: '${this.config.txKind}'`);
    }
    if (this.config.outTxsFileName === this.config.outTxStatFileName && !!this.config.outTxsFileName) {
      throw new Error("The file name for txs is the same as for the tx statistics. Check the config!");
    }
    if (this.config.outTxsFileName === this.config.outBlocksFileName && !!this.config.outBlocksFileName) {
      throw new Error("The file name for txs is the same as for the blocks. Check the config!");
    }
    if (this.config.outTxStatFileName === this.config.outBlocksFileName && !!this.config.outTxStatFileName) {
      throw new Error("The file name for the tx statistics is the same as for the blocks. Check the config!");
    }
  }

  initProvider() {
    this.provider = new JsonRpcProvider(this.config.rpcUrlForReading);
  }

  initWallet() {
    this.wallet = new Wallet(this.config.fromPrivateKey, this.provider);
  }

  async initTxs(nonce: number, count: number) {
    this.txs = await prepareSignedTxs(this, nonce, count);
  }

  initTxTotal() {
    this.txTotal = this.config.sendingDurationInSeconds * this.config.txsPerSecondRate;
  }

  async initStartUpBlockNumber() {
    this.startUpBlockNumber = await this.provider.getBlockNumber();
  }

  initTxResults() {
    this.txResults = defineTransactionResults(this.txs, this.txBatches);
  }
}