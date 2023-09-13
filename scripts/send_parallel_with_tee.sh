#!/usr/bin/env bash

set -euo pipefail

################################################################################
# Input parameters
################################################################################

RPC_URL_FOR_SENDING="http://localhost:8333"    # The RPC URL for sending transactions
RPC_URL_FOR_READING=$RPC_URL_FOR_SENDING       # The RPC URL for reading the blockchain state
TX_RATE=100                                    # The target transaction sending rate in tx/s
DURATION=10                                    # The duration of transaction sending in seconds
TX_KIND="erc20-transfer"                       # The kind of the transactions to send
SENT_ETH_VALUE=0                               # The value of Ether or other native tokens to be sent in transactions
SENT_AMOUNT=0                                  # The amount argument for a contract function call if it is needed

# The contract address if it is needed
CONTRACT_ADDRESS="0x541F23C66D131B7d35214401AEC745d7aBB07561"

# A suffix that will be added to the result files along with the utility instance index
# like `out_tx_stat_some-net_03__2023-08-31_18-18-58_746.csv`
FILES_SUFFIX="some-net"

## The PK array. Its length defines the number of utility instances to run
declare -a PKS=(
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  "5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
  "7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
  "47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
  "8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"
  "92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"
  "4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"
  "dbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"
  "2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"
)

# The addresses to send. This array length should be equal to the PKS array length
declare -a TO_ADDRESSES=(
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9"
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"
  "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"
)

################################################################################
# Main code
################################################################################

SCRIPTPATH="$(
  cd -- "$(dirname "$0")" >/dev/null 2>&1
  pwd -P
)"
PARENTDIR="$(dirname "$SCRIPTPATH")"

for INX in ${!PKS[*]}; do
  export PK_INDEX=$INX
  export SP_RPC_URL_FOR_SENDING=$RPC_URL_FOR_SENDING
  export SP_RPC_URL_FOR_READING=$RPC_URL_FOR_READING
  export SP_FROM_PRIVATE_KEY=${PKS[$INX]}
  export SP_TO_STATIC_ADDRESS=${TO_ADDRESSES[$INX]}
  export SP_TXS_PER_SECOND_RATE=$TX_RATE
  export SP_SENDING_DURATION_IN_SECONDS=$DURATION
  export SP_TX_KIND=$TX_KIND
  export SP_SENT_ETH_VALUE=$SENT_ETH_VALUE
  export SP_SENT_AMOUNT=$SENT_AMOUNT
  export SP_CONTRACT_ADDRESS=$CONTRACT_ADDRESS
  export SP_OUT_FILES_SUFFIX=$(printf '%s_%02d_' $FILES_SUFFIX $INX)
  export SP_INSTANCE_INDEX=$(printf '%02d' $INX)

  (
    echo "Start instance $SP_INSTANCE_INDEX"
    npx ts-node ../src/index.ts
    echo "End instance $SP_INSTANCE_INDEX"
  ) | tee "instance${SP_INSTANCE_INDEX}.log" &
done
