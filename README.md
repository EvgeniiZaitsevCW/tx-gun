# Tx Gun



## Description

A utility for blockchain performance testing.

It allows to send multiple transactions to a blockchain node and analyze their minting.

The utility submits transactions to a blockchain in batches through HTTP RPC requests. This allows to overcome slow internet-connection and communication delays.

Using `curl` an RPC batch can be presented like the following bash script:
```
#!/bin/sh
RPC_URL="http://localhost:8333"
TX1="0xf86781938504a817c80082520894f39fd6e51aad88f6f4ce6ab8827279cfffb922668080820a96a004b0982ed83094cd4bbb9c06bd8e1d818f85d7d7c0b827f20a910088bb002c46a027ce071fe529ae53ba276c8b94f457f5223bd6d44e799e55446afddcc88754c5"
TX2="0xf86781948504a817c80082520894f39fd6e51aad88f6f4ce6ab8827279cfffb922668080820a96a018d9e0e9310c24babd1af69cb7315a5bded6edd9b7cda521591ad9b3bc539f57a05a4a213fde2d4d7d1231d3acc68d15d7bb160194996bdee29cb6e8e4c0ee728c"
TX3="0xf86781958504a817c80082520894f39fd6e51aad88f6f4ce6ab8827279cfffb922668080820a95a0d434d2dbb5bf9f6c7a501eb386fc4d08af26650a6ec3ac653a750210c9bd7f32a00fe5c407796ea76a5087f98ea47aba532e28faab0fbc32a01691cc67a1e52ce4"
REQ1='{"method": "eth_blockNumber", "params": [], "id": 1, "jsonrpc": "2.0" }'
REQ2='{"method":"eth_sendRawTransaction","params":["'$TX1'"],"id":2,"jsonrpc":"2.0"}'
REQ3='{"method":"eth_sendRawTransaction","params":["'$TX2'"],"id":3,"jsonrpc":"2.0"}'
REQ4='{"method":"eth_sendRawTransaction","params":["'$TX3'"],"id":4,"jsonrpc":"2.0"}'
REQ5='{"method": "eth_blockNumber", "params": [], "id": 1000000, "jsonrpc": "2.0" }'
REQUEST="[$REQ1,$REQ2,$REQ3,$REQ4,$REQ5]"
curl -H "Content-Type: application/json" -d "$REQUEST" "$RPC_URL" | jq
```

Here the batch consists of 5 requests.
The first and the last ones are requests about the current block number.
Requests `REQ2`, `REQ3`, `REQ4` are for transaction sending.

The response for the batch might look like:
```
[
  {
    "id": 1,
    "jsonrpc": "2.0",
    "result": "0x243"
  },
  {
    "id": 2,
    "jsonrpc": "2.0",
    "result": "0x5ce64dee168c1c0b63f346b6ea5952a6c768eeca2802e912fe5c09258549babf"
  },
  {
    "id": 3,
    "jsonrpc": "2.0",
    "result": "0xe872672902086d45e7769df547d6198886f46d5555ec9c25c2f8ce53236fbcdf"
  },
  {
    "id": 4,
    "jsonrpc": "2.0",
    "result": "0xcfa9236d20679d990c28d05b4d637a04a1a3e24a718814b86281ab7f689b4d5e"
  },
  {
    "id": 1000000,
    "jsonrpc": "2.0",
    "result": "0x243"
  }
]
```

So we get the block numbers and transaction hashes at one in a single response. It helps to analyze statistics of transaction minting.

## Supported transaction types

|  #  | Type           | Description                                                                                                                                                                      |
|:---:|----------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|  1  | common         | Sending native tokens from one account to another. A transaction can include the data field with random or static data field. The number of tokens (the value field) can be zero |
|  2  | erc20-transfer | Transferring ERC-20 tokens from one account to another. The amount of tokens can be arbitrary configured. Recipient address can be random or static                              |
|  3  | pix-cash-in    | Calling the `cashIn()` function of a special PIX smart-contract used in the networks of Cloudwalk company                                                                        |


## Steps to run locally

1. Be sure you have NodeJS (at least version 14) and NPM (at least version 6.14) are installed by running:
   ```bash
   node --version
   npm --version
   ```
2. Clone the repository to your machine and switch to the repository directory.

3. Run the installation of dependencies:
   ```bash
   npm install
   ```

4. Configure the input parameters in the `src/index.ts` file or by setting the appropriate environment variables mentioned in the file.
   See [the next](#input-parameters) sections for details.

5. Run the main script:
   ```bash
   npx ts-node src/index.ts 
   ```

6. Observe the console output. The utility will provide some statistics about sent transactions to you if everything was done successfully.

7. Observe the output files in the `results` directory if they were configured to be produced.

## Input parameters

| Name                       | Env variable                      | Default value            | Description                                                                                                                                                                                                                                                      |
|----------------------------|-----------------------------------|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| rpcUrlForSending           | SP_RPC_URL_FOR_SENDING            | http://localhost:8333    | The URL of an RPC endpoint to send transactions                                                                                                                                                                                                                  |
| rpcUrlForReading           | SP_RPC_URL_FOR_READING            | http://localhost:8333    | The URL of an RPC endpoint to read blockchain data                                                                                                                                                                                                               |
| fromPrivateKey             | SP_FROM_PRIVATE_KEY               | <Hardhat test PK 1>      | The private key of the account used for transaction signing                                                                                                                                                                                                      |
| txKind                     | SP_TX_KIND                        | "common"                 | The type of transaction to be sent: "common", "erc20-transfer", "pix-cash-in"                                                                                                                                                                                    |
| contractAddress            | SP_CONTRACT_ADDRESS               | <some non-zero>          | The address of the contract to interact with. It is used only if `txKind` is not `"common"`                                                                                                                                                                      |
| isToAddressStatic          | SP_IS_TO_ADDRESS_STATIC           | true                     | Indicates whether the destination address is static                                                                                                                                                                                                              |
| toStaticAddress            | SP_TO_STATIC_ADDRESS              | <Hardhat test account 1> | The static destination address for transactions if it is static                                                                                                                                                                                                  |
| sentEthValue               | SP_SENT_ETH_VALUE                 | 0                        | The value of Ether or other native tokens to be sent in transactions                                                                                                                                                                                             |
| sentAmount                 | SP_SENT_AMOUNT                    | 1                        | The amount of ERC-20 tokens to be sent in transactions. It is used only if `txKind` is not `"common"`                                                                                                                                                            |
| isDataFieldStatic          | SP_IS_DATA_FIELD_STATIC           | false                    | Indicates whether the data field of transaction is static. It is used only if `txKind` is `"common"`                                                                                                                                                             |
| rndDataFieldSize           | SP_RND_DATA_FIELD_SIZE            | 0                        | The size of the random data field in transactions if it is not static                                                                                                                                                                                            |
| staticDataFieldValue       | SP_STATIC_DATA_FIELD_VALUE        | <some non-empty>         | The static value of the data field in transactions                                                                                                                                                                                                               |
| isLegacyTx                 | SP_IS_LEGACY_TX                   | true                     | Indicates whether transactions are legacy according to standards EIP-2718 and EIP-1559                                                                                                                                                                           |
| autoGasPrice               | SP_AUTO_GAS_PRICE                 | true                     | Indicates whether to calculate gas price automatically                                                                                                                                                                                                           |
| autoGasPriceCoefInPpm      | SP_AUTO_GAS_PRICE_COEF_IN_PPM     | 1000000                  | The coefficient for calculating automatic gas price in PPM. The result gas price formula is `gasPrice = autoGasPrice * autoGasPriceCoefInPpm / 1000000`                                                                                                          |
| gasPrice                   | SP_GAS_PRICE                      | 1                        | The gas price for transactions if it is not defined automatically                                                                                                                                                                                                |
| autoGasLimit               | SP_AUTO_GAS_LIMIT                 | true                     | Indicates whether to calculate gas limit automatically                                                                                                                                                                                                           |
| autoGasLimitCoefInPpm      | SP_AUTO_GAS_LIMIT_COEF_IN_PPM     | 1000000                  | The coefficient for calculating automatic gas limit in PPM. The result gas limit formula is `gasLimit = autoGasLimit * autoGasPriceCoefInPpm / 1000000`                                                                                                          |
| gasLimit                   | SP_GAS_LIMIT                      | 1                        | The gas limit for transactions if it is not defined automatically                                                                                                                                                                                                |
| txsPerSecondRate           | SP_TXS_PER_SECOND_RATE            | 3                        | The rate of transactions to be sent per second                                                                                                                                                                                                                   |
| sendingDurationInSeconds   | SP_SENDING_DURATION_IN_SECONDS    | 5                        | The duration of transaction sending in seconds                                                                                                                                                                                                                   |
| millisecondsOfStart        | SP_MILLISECONDS_OF_START          | "0000"                   | The milliseconds of the local time to start transaction sending. E.g. if you set it to `0000` and the current Unix timestamp (in milliseconds) is 1688918972345 (2023-07-09 16:09:32.345 GMT) then sending will start at 1688918980000 (2023-07-09 23:09:40.000) |
| rpcBatchMaxSize            | SP_RPC_BATCH_MAX_SIZE             | 1000000                  | The maximum size of an RPC batch excluding service requests. If you want to send only a single transaction per batch set it to 1                                                                                                                                 |
| pauseBeforeNextBatch       | SP_PAUSE_BEFORE_NEXT_BATCH        | 0                        | The pause duration in milliseconds before sending the next batch                                                                                                                                                                                                 |
| awaitTxsMinting            | SP_AWAIT_TXS_MINTING              | true                     | Indicates whether to wait for transaction minting. If it is set to `false` the script will not collect the minting statistics                                                                                                                                    |
| txsMintingTimeoutInSeconds | SP_TXS_MINTING_TIMEOUT_IN_SECONDS | 60                       | The timeout for transaction minting in seconds                                                                                                                                                                                                                   |
| outTxsFileName             | SP_OUT_TXS_FILE_NAME              | "out_txs"                | The filename for the output transactions file that is created in the `results` directory. The file format is `<outTxsFileName>_<outFilesSuffix>_YYYY-MM-DD_HH-mm-ss_SSS.csv`. If you do not need this file set this variable to empty string `""`                |
| outBlocksFileName          | SP_OUT_BLOCKS_FILE_NAME           | "out_blocks"             | The filename for the output blocks file that is created in the `results` directory. The file format is `<outBlocksFileName>_<outFilesSuffix>_YYYY-MM-DD_HH-mm-ss_SSS.csv`. If you do not need this file set this variable to empty string `""`                   |
| outTxStatFileName          | SP_OUT_TX_STAT_FILE_NAME          | "out_tx_stat"            | The filename for the output transaction statistics file that is created in the `results` directory. The file format is `<outTxStatFileName>_<outFilesSuffix>_YYYY-MM-DD_HH-mm-ss_SSS.csv`. If you do not need this file set this variable to empty string `""`   |                                                                                                                                                                                                         |
| outFilesSuffix             | SP_OUT_FILES_SUFFIX               | "op-local"               | The suffix for the output file names. See their formats above                                                                                                                                                                                                    |


## Additional tools
* [scripts/send_parallel.sh](scripts/send_parallel.sh) -- a script to run several instances of the utility to send transactions in parallel. The number of instances is defined by the number of private keys in the script.
