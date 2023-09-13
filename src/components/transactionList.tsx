import { TransactionWithSignatures } from "@/app/api/fetch-transactions/route";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useEffect, useState } from "react";
import getUserOpHash from "@/utils/getUserOpHash";
import { useWalletClient } from "wagmi";
import { BigNumber } from "ethers";
import { BUNDLER_RPC_URL } from "@/utils/constants";
import { Client, IUserOperation } from "userop";
import Icon from "./icon";
import { getUserOperationBuilder } from "@/utils/getUserOperationBuilder";

interface TransactionListProps {
  address: string;
  walletAddress: string;
}

export default function TransactionsList({
  address,
  walletAddress,
}: TransactionListProps) {
  const [walletTxns, setWalletTxns] = useState<TransactionWithSignatures[]>([]);
  const [loading, setLoading] = useState(false);
  const { data: walletClient } = useWalletClient();
  const isMounted = useIsMounted();

  const fetchTransactions = async () => {
    try {
      const response = await fetch(
        `/api/fetch-transactions?walletAddress=${walletAddress}`
      );
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setWalletTxns(data.transactions);
    } catch (error) {
      if (error instanceof Error) window.alert(error.message);
      console.error(error);
    }
  };

  // Define the signTransaction function
  const signTransaction = async (transaction: TransactionWithSignatures) => {
    // If there's no wallet client, return immediately
    if (!walletClient) return;

    try {
      // Set loading to true to indicate the signing process has started
      setLoading(true);

      // Get the user operation hash from the transaction
      const userOpHash = await getUserOpHash(
        transaction.userOp as unknown as IUserOperation
      );

      // Request the wallet client to sign the message with the user operation hash
      const signature = await walletClient.signMessage({
        message: { raw: userOpHash as `0x${string}` },
      });

      // Send a POST request to the create-signature endpoint with the signer's address, signature, and transaction ID
      const response = await fetch("/api/create-signature", {
        method: "POST",
        body: JSON.stringify({
          signerAddress: address,
          signature,
          transactionId: transaction.id,
        }),
      });

      // Parse the response data
      const data = await response.json();

      // If there's an error in the response data, throw it
      if (data.error) throw new Error(data.error);

      // Alert the user that the transaction was signed successfully
      window.alert("Transaction signed successfully");

      // Reload the page to reflect the new state
      window.location.reload();
    } catch (e) {
      // Log any errors that occur during the process
      console.error(e);

      // If the error is an instance of Error, alert the user with the error message
      if (e instanceof Error) window.alert(e.message);

      // Set loading to false to indicate the signing process has ended
      setLoading(false);
    }
  };

  // Define the sendTransaction function
  const sendTransaction = async (transaction: TransactionWithSignatures) => {
    try {
      // Set loading to true to indicate the transaction sending process has started
      setLoading(true);

      // Get the user operation from the transaction
      const userOp = transaction.userOp as unknown as IUserOperation;

      // Initialize the bundler's client
      const client = await Client.init(BUNDLER_RPC_URL);

      // Create an array to store the ordered signatures
      const orderedSignatures: string[] = [];

      // Order the signatures based on the order of the signers
      transaction.wallet.signers.forEach((signer) => {
        transaction.signatures.forEach((signature) => {
          if (signature.signerAddress === signer) {
            orderedSignatures.push(signature.signature);
          }
        });
      });

      // If the number of ordered signatures is not equal to the number of signers, throw an error
      if (orderedSignatures.length != transaction.wallet.signers.length)
        throw new Error("Fewer signatures received than expected");

      // Get the initCode from the user operation
      let initCode = userOp.initCode as Uint8Array;

      // If the wallet is already deployed, set the initCode to an empty array
      if (transaction.wallet.isDeployed) {
        initCode = Uint8Array.from([]);
      }

      // Get the user operation builder
      const builder = await getUserOperationBuilder(
        userOp.sender,
        BigNumber.from(userOp.nonce),
        initCode,
        userOp.callData.toString(),
        orderedSignatures
      );

      // Set the maxFeePerGas and maxPriorityFeePerGas in the builder
      builder
        .setMaxFeePerGas(userOp.maxFeePerGas)
        .setMaxPriorityFeePerGas(userOp.maxPriorityFeePerGas);

      // Send the user operation and wait for the result
      const result = await client.sendUserOperation(builder);
      const finalUserOpResult = await result.wait();

      // Get the transaction receipt
      const txHashReciept = await finalUserOpResult?.getTransactionReceipt();

      // Get the transaction hash from the receipt
      const txHash = txHashReciept?.transactionHash;

      // Mark the wallet as deployed by sending a POST request to the update-wallet-deployed endpoint
      await fetch("/api/update-wallet-deployed", {
        method: "POST",
        body: JSON.stringify({
          walletId: transaction.wallet.id,
          transactionId: transaction.id,
          txHash,
        }),
      });

      // Alert the user that the transaction was sent successfully
      window.alert("Transaction sent successfully");

      // Reload the page to reflect the new state
      window.location.reload();
    } catch (e) {
      // Log any errors that occur during the process
      console.error(e);

      // If the error is an instance of Error, alert the user with the error message
      if (e instanceof Error) {
        window.alert(e.message);
      }

      // Set loading to false to indicate the transaction sending process has ended
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [address]);

  if (!isMounted) return null;

  return (
    <main className="flex flex-col justify-center p-10 items-center  gap-5">
      <h1 className="text-5xl font-bold">Transactions</h1>

      {walletTxns.length === 0 && (
        <div className="flex justify-center items-center border-2 border-dashed p-6 rounded-lg">
          <p className="text-lg">You currently have no transactions.</p>
        </div>
      )}

      {walletTxns.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {walletTxns.map((transaction) => (
            <div
              key={transaction.id}
              className="flex flex-col border border-gray-800 rounded-lg gap-2 p-2"
            >
              <span className="bg-gray-800 w-full text-center">
                Transaction #{transaction.id}
              </span>
              <div className="flex flex-col gap-2">
                {transaction.signatures.map((signature) => (
                  <div
                    key={signature.signature}
                    className="flex font-mono gap-4"
                  >
                    <span>{signature.signerAddress}</span>
                    <Icon type="check" />
                  </div>
                ))}
                {transaction.pendingSigners.map((signer) => (
                  <div key={signer} className="flex font-mono gap-4">
                    <span>{signer}</span>
                    <Icon type="xmark" />
                  </div>
                ))}

                {transaction.txHash ? (
                  <button
                    className="bg-blue-500 mx-auto hover:bg-blue-700 disabled:bg-blue-500/50 disabled:hover:bg-blue-500/50 hover:transition-colors text-white font-bold py-2 w-fit px-4 rounded-lg"
                    onClick={() =>
                      window.open(
                        `https://goerli.etherscan.io/tx/${transaction.txHash}`,
                        "_blank"
                      )
                    }
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-4 border-gray-300 border-l-white items-center justify-center mx-auto" />
                    ) : (
                      `View on Etherscan`
                    )}
                  </button>
                ) : transaction.pendingSigners.length === 0 ? (
                  <button
                    className="bg-blue-500 mx-auto hover:bg-blue-700 disabled:bg-blue-500/50 disabled:hover:bg-blue-500/50 hover:transition-colors text-white font-bold py-2 w-fit px-4 rounded-lg"
                    onClick={() => sendTransaction(transaction)}
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-4 border-gray-300 border-l-white items-center justify-center mx-auto" />
                    ) : (
                      `Execute Txn`
                    )}
                  </button>
                ) : transaction.pendingSigners.includes(
                    address.toLowerCase()
                  ) ? (
                  <button
                    className="bg-blue-500 mx-auto hover:bg-blue-700 disabled:bg-blue-500/50 disabled:hover:bg-blue-500/50 hover:transition-colors text-white font-bold py-2 w-fit px-4 rounded-lg"
                    onClick={() => signTransaction(transaction)}
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-4 border-gray-300 border-l-white items-center justify-center mx-auto" />
                    ) : (
                      `Sign Txn`
                    )}
                  </button>
                ) : (
                  <button
                    className="bg-blue-500 mx-auto hover:bg-blue-700 disabled:bg-blue-500/50 disabled:hover:bg-blue-500/50 hover:transition-colors text-white font-bold py-2 w-fit px-4 rounded-lg"
                    disabled
                  >
                    No Action Reqd
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
