import { createSmartAccountClient } from '@biconomy-devx/account';
import type { Hex } from 'viem';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as chains from 'viem/chains';

import { getBiconomyPaymasterApiKey, getBundlerUrl } from './chainConfig';

/**
 *
 * @param chainId - chainId
 */
function getChain(chainId: number) {
  for (const chain of Object.values(chains)) {
    if ('id' in chain) {
      if (chain.id === chainId) {
        return chain;
      }
    }
  }

  throw new Error(`Chain with id ${chainId} not found`);
}

export const getBiconomySmartAccount = async (
  chainId: number,
  privateKey: Hex,
) => {
  const signerAccount = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account: signerAccount,
    chain: getChain(chainId),
    transport: http(),
  });

  const smartAccount = await createSmartAccountClient({
    signer: client,
    bundlerUrl: getBundlerUrl(chainId),
    biconomyPaymasterApiKey: getBiconomyPaymasterApiKey(chainId),
    // index: // saltToInt
  });

  return smartAccount;
};
