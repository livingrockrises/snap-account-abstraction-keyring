import {
  MethodNotSupportedError,
  handleKeyringRequest,
} from '@metamask/keyring-api';
import {
  panel,
  type OnKeyringRequestHandler,
  type OnRpcRequestHandler,
  heading,
  divider,
  text,
} from '@metamask/snaps-sdk';
import { Wallet } from 'ethers';

import { BiconomyKeyring } from './biconomyKeyring';
import type { ChainConfig } from './keyring';
import { logger } from './logger';
import { InternalMethod, originPermissions } from './permissions';
import { getState } from './stateManagement';

let keyring: BiconomyKeyring;

/**
 * Return the keyring instance. If it doesn't exist, create it.
 */
async function getKeyring(): Promise<BiconomyKeyring> {
  if (!keyring) {
    const state = await getState();
    if (!keyring) {
      keyring = new BiconomyKeyring(state);
    }
  }
  return keyring;
}

export const promptUser = async (
  prompt: string,
  description: string,
  content: string,
): Promise<boolean> => {
  const response: any = await snap.request({
    method: 'snap_dialog',
    params: {
      type: 'confirmation',
      content: panel([
        heading('Transaction request'),
        divider(),
        text(`**${prompt}**`),
        text(`${description}`),
        text(`${content}`),
      ]),
    },
  });
  console.log('Prompt user response', response);
  if (response) {
    return response;
  }
  return false;
};

/**
 * Verify if the caller can call the requested method.
 *
 * @param origin - Caller origin.
 * @param method - Method being called.
 * @returns True if the caller is allowed to call the method, false otherwise.
 */
function hasPermission(origin: string, method: string): boolean {
  return originPermissions.get(origin)?.includes(method) ?? false;
}

/**
 *
 */
async function getEntropy() {
  return snap.request({
    method: 'snap_getEntropy',
    params: {
      version: 1,
      salt: 'bar',
    },
  });
}

export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  logger.debug(
    `RPC request (origin="${origin}"):`,
    JSON.stringify(request, undefined, 2),
  );

  // Check if origin is allowed to call method.
  if (!hasPermission(origin, request.method)) {
    throw new Error(
      `Origin '${origin}' is not allowed to call '${request.method}'`,
    );
  }

  // Handle custom methods.
  switch (request.method) {
    case InternalMethod.SetConfig: {
      if (!request.params?.length) {
        throw new Error('Missing config');
      }
      return (await getKeyring()).setConfig(request.params as ChainConfig);
    }

    case 'genPk':
      {
        // https://docs.metamask.io/snaps/reference/rpc-api/#snap_dialog

        const entropy = await getEntropy();
        console.log('entropy', entropy);
        

        // const size = 0;
        // const path = `m/44'/60'/0'/0/${size}`;

        // const mnemonic = entropyToMnemonic(entropy);
        // const wallet = Wallet.fromMnemonic(mnemonic);

        const ethNode = await snap.request({
          method: 'snap_getBip44Entropy',
          params: {
            coinType: 1, // 1 is for all Testnets
          },
        });

        console.log('ethNode', ethNode);
      }
      break;

    default: {
      throw new MethodNotSupportedError(request.method);
    }
  }
};

export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}) => {
  logger.info(
    `Keyring request (origin="${origin}"):`,
    JSON.stringify(request, undefined, 2),
  );

  // Check if origin is allowed to call method.
  if (!hasPermission(origin, request.method)) {
    throw new Error(
      `Origin '${origin}' is not allowed to call '${request.method}'`,
    );
  }

  // Handle keyring methods.
  return handleKeyringRequest(await getKeyring(), request);
};
