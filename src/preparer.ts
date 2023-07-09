import { Config, TransactionSigned, TX_KIND_ERC20_TRANSFER, TX_KIND_PIX_CASH_IN } from "./types";
import { createEoaAddress, createRndHexString } from "./utils";
import { ethers, FeeData, Interface, Transaction, TransactionRequest } from "ethers";
import { Context } from "./context";

// 1.0 in PPM
const UNIT_IN_PPM = 1000000;

const erc20TransferInterface: Interface = ethers.Interface.from(
  ["function transfer(address to, uint256 amount) external returns (bool)"]
);

const pixCashInInterface: Interface = ethers.Interface.from(
  ["function cashIn(address account, uint256 amount, bytes32 txId) external"]
);

async function defineToAddress(context: Context): Promise<string> {
  if (context.config.isToAddressStatic) {
    return context.config.toStaticAddress;
  } else {
    return createEoaAddress(context.provider);
  }
}

function defineCommonTxDataField(
  config: Config,
  props: { gasEstimation: boolean } = { gasEstimation: false }
): string | null {
  if (config.isDataFieldStatic) {
    return config.staticDataFieldValue;
  } else {
    if (config.dataFieldSize > 0) {
      if (!props.gasEstimation) {
        return "0x" + createRndHexString(config.dataFieldSize * 2);
      } else {
        return "0x".padEnd(config.dataFieldSize * 2 + 2, "F");
      }
    } else {
      return null;
    }
  }
}

async function fillToAddressAndDataField(
  tx: TransactionRequest,
  context: Context,
  props: { gasEstimation: boolean } = { gasEstimation: false }
) {
  const config: Config = context.config;
  let to: string;
  let recipient: string = "";
  if (context.config.txKind === TX_KIND_ERC20_TRANSFER || context.config.txKind === TX_KIND_PIX_CASH_IN) {
    to = context.config.contractAddress;
    recipient = await defineToAddress(context);
  } else {
    to = await defineToAddress(context);
  }

  let data: string | null;
  switch (config.txKind) {
    case  TX_KIND_ERC20_TRANSFER: {
      data = erc20TransferInterface.encodeFunctionData("transfer", [recipient, config.sentAmount]);
      break;
    }
    case TX_KIND_PIX_CASH_IN: {
      data = pixCashInInterface.encodeFunctionData("cashIn", [
        recipient,
        config.sentAmount,
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      ]);
      break;
    }
    default: {
      data = defineCommonTxDataField(config, props);
    }
  }
  if (data) {
    tx.data = data;
  }
  tx.to = to;
}


async function defineGasLimit(context: Context): Promise<bigint> {
  if (context.config.autoGasLimit) {
    const tx: TransactionRequest = {
      value: context.config.sentEthValue,
    };
    await fillToAddressAndDataField(tx, context, { gasEstimation: true });
    let gasLimit = await context.wallet.estimateGas(tx);
    if (context.config.autoGasLimitCoefInPpm != UNIT_IN_PPM) {
      gasLimit = gasLimit * BigInt(context.config.autoGasLimitCoefInPpm) / BigInt(UNIT_IN_PPM);
    }
    return gasLimit;
  } else {
    return context.config.gasLimit;
  }
}

function applyGasPriceCoef(tx: TransactionRequest, config: Config) {
  if (!!tx.gasPrice && config.autoGasPriceCoefInPpm !== UNIT_IN_PPM) {
    tx.gasPrice = BigInt(tx.gasPrice.toString()) * BigInt(config.autoGasPriceCoefInPpm) / BigInt(UNIT_IN_PPM);
  }
  if (!!tx.maxFeePerGas && config.autoGasPriceCoefInPpm !== UNIT_IN_PPM) {
    tx.maxFeePerGas = BigInt(tx.maxFeePerGas) * BigInt(config.autoGasPriceCoefInPpm) / BigInt(UNIT_IN_PPM);
  }
  if (!!tx.maxPriorityFeePerGas && config.autoGasPriceCoefInPpm !== UNIT_IN_PPM) {
    tx.maxPriorityFeePerGas =
      BigInt(tx.maxPriorityFeePerGas) * BigInt(config.autoGasPriceCoefInPpm) / BigInt(UNIT_IN_PPM);
  }
}

async function fillGasPrice(tx: TransactionRequest, context: Context) {
  if (!context.config.autoGasPrice) {
    if (context.config.isLegacyTx) {
      tx.gasPrice = context.config.gasPrice;
    } else {
      tx.maxFeePerGas = context.config.gasPrice;
      tx.maxPriorityFeePerGas = context.config.gasPrice;
    }
  } else {
    const feeData: FeeData = await context.provider.getFeeData();
    if (context.config.isLegacyTx) {
      tx.gasPrice = <bigint>feeData.gasPrice;
    } else {
      if (feeData.maxFeePerGas == null || feeData.maxPriorityFeePerGas == null) {
        throw new Error("The network does not supported the eip-1559 transactions");
      }
      tx.maxFeePerGas = feeData.maxFeePerGas;
      tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    }
    applyGasPriceCoef(tx, context.config);
  }
}

export async function prepareSignedTxs(
  context: Context,
  nonce: number,
  count: number
): Promise<TransactionSigned[]> {
  const txs: TransactionSigned[] = [];
  const txTemplate: TransactionRequest = {
    from: context.wallet.address,
    to: context.config.toStaticAddress,
    value: context.config.sentEthValue,
    gasLimit: await defineGasLimit(context),
    chainId: (await context.provider.getNetwork()).chainId,
    type: context.config.isLegacyTx ? 0 : 2,
  };
  await fillGasPrice(txTemplate, context);
  for (; count > 0; --count) {
    const tx: TransactionRequest = Object.assign({}, txTemplate);
    await fillToAddressAndDataField(tx, context);
    tx.nonce = nonce++;

    const txSignedRaw: string = await context.wallet.signTransaction(tx);
    const txParsed: Transaction = Transaction.from(txSignedRaw);
    const t: TransactionSigned = <TransactionSigned>{
      raw: txSignedRaw,
      type: txParsed.type,
      to: txParsed.to,
      from: txParsed.from,
      nonce: txParsed.nonce,
      gasLimit: txParsed.gasLimit,
      gasPrice: txParsed.gasPrice,
      maxPriorityFeePerGas: txParsed.maxPriorityFeePerGas,
      maxFeePerGas: txParsed.maxFeePerGas,
      data: txParsed.data,
      value: txParsed.value,
      chainId: txParsed.chainId,
      hash: txParsed.hash,
      signature: txParsed.signature,
      accessList: txParsed.accessList,
    };
    txs.push(t);
  }
  return txs;
}