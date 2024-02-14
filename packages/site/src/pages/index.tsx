import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { KeyringSnapRpcClient } from '@metamask/keyring-api';
import Grid from '@mui/material/Grid';
import React, { useContext, useEffect, useState } from 'react';
import * as uuid from 'uuid';

import { Accordion, AccountList, Card, ConnectButton } from '../components';
import {
  CardContainer,
  Container,
  Divider,
  DividerTitle,
  StyledBox,
} from '../components/styledComponents';
import { defaultSnapOrigin } from '../config';
import { MetamaskActions, MetaMaskContext } from '../hooks';
import { InputType } from '../types';
import type { KeyringState } from '../utils';
import { connectSnap, getSnap, isSynchronousMode } from '../utils';

const snapId = defaultSnapOrigin;

const initialState: {
  pendingRequests: KeyringRequest[];
  accounts: KeyringAccount[];
  useSynchronousApprovals: boolean;
} = {
  pendingRequests: [],
  accounts: [],
  useSynchronousApprovals: true,
};

const Index = () => {
  const [state, dispatch] = useContext(MetaMaskContext);
  const [snapState, setSnapState] = useState<KeyringState>(initialState);
  // Is not a good practice to store sensitive data in the state of
  // a component but for this case it should be ok since this is an
  // internal development and testing tool.
  const [privateKey, setPrivateKey] = useState<string | null>();
  const [salt, setSalt] = useState<string | null>();
  const [accountId, setAccountId] = useState<string | null>();
  const [accountObject, setAccountObject] = useState<string | null>();
  const [requestId, setRequestId] = useState<string | null>(null);
  // UserOp method state
  const [chainConfig, setChainConfigObject] = useState<string | null>();

  const client = new KeyringSnapRpcClient(snapId, window.ethereum);

  useEffect(() => {
    /**
     * Return the current state of the snap.
     *
     * @returns The current state of the snap.
     */
    async function getState() {
      if (!state.installedSnap) {
        return;
      }
      const accounts = await client.listAccounts();
      const pendingRequests = await client.listRequests();
      const isSynchronous = await isSynchronousMode();
      setSnapState({
        accounts,
        pendingRequests,
        useSynchronousApprovals: isSynchronous,
      });
    }

    getState().catch((error) => console.error(error));
  }, [state.installedSnap]);

  const syncAccounts = async () => {
    const accounts = await client.listAccounts();
    setSnapState({
      ...snapState,
      accounts,
    });
  };

  const createAccount = async () => {
    const newAccount = await client.createAccount({
      privateKey: privateKey as string,
      salt: salt as string,
    });
    await syncAccounts();
    return newAccount;
  };

  const deleteAccount = async () => {
    await client.deleteAccount(accountId as string);
    await syncAccounts();
  };

  const updateAccount = async () => {
    if (!accountObject) {
      return;
    }
    const account: KeyringAccount = JSON.parse(accountObject);
    await client.updateAccount(account);
    await syncAccounts();
  };

  // UserOp methods (default to send from first AA account created)
  const setChainConfig = async () => {
    if (!chainConfig) {
      return;
    }
    const request: KeyringRequest = {
      id: uuid.v4(),
      scope: '',
      account: uuid.v4(),
      request: {
        method: 'snap.internal.setConfig',
        params: [JSON.parse(chainConfig)],
      },
    };
    await client.submitRequest(request);
  };

  const testCustomMethod = async () => {
    const response = await window.ethereum.request({
      method: 'wallet_invokeSnap',
      params: {
        snapId: defaultSnapOrigin,
        request: { method: 'genPk' },
      },
    });
    console.log('response', response);
    return response;
  };

  const handleConnectClick = async () => {
    try {
      await connectSnap();
      const installedSnap = await getSnap();

      dispatch({
        type: MetamaskActions.SetInstalled,
        payload: installedSnap,
      });
    } catch (error) {
      console.error(error);
      dispatch({ type: MetamaskActions.SetError, payload: error });
    }
  };

  // Note: not using this for now
  // const handleUseSyncToggle = useCallback(async () => {
  //   console.log('Toggling synchronous approval');
  //   await toggleSynchronousApprovals();
  //   setSnapState({
  //     ...snapState,
  //     useSynchronousApprovals: !snapState.useSynchronousApprovals,
  //   });
  // }, [snapState]);

  const userOpMethods = [
    {
      name: 'Set Chain Config',
      description:
        'Set account abstraction configuration options for the current chain.',
      inputs: [
        {
          id: 'set-chain-config-chain-config-object',
          title: 'Chain Config Object',
          type: InputType.TextArea,
          placeholder:
            '{\n' +
            '    "simpleAccountFactory": "0x97a0924bf222499cBa5C29eA746E82F230730293",\n' +
            '    "entryPoint": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",\n' +
            '    "bundlerUrl": "https://bundler.example.com/rpc",\n' +
            '    "customVerifyingPaymasterPK": "abcd1234qwer5678tyui9012ghjk3456zxcv7890",\n' +
            '    "customVerifyingPaymasterAddress": "0x123456789ABCDEF0123456789ABCDEF012345678"\n' +
            '}',
          onChange: (event: any) =>
            setChainConfigObject(event.currentTarget.value),
        },
      ],
      action: {
        disabled: Boolean(accountId),
        callback: async () => await setChainConfig(),
        label: 'Set Chain Configs',
      },
      successMessage: 'Chain Config Set',
    },
  ];

  const accountManagementMethods = [
    {
      name: 'Create account',
      description: 'Create a 4337 account using an admin private key',
      inputs: [
        {
          id: 'create-account-private-key',
          title: 'Private key',
          value: privateKey,
          type: InputType.TextField,
          placeholder:
            'E.g. 0000000000000000000000000000000000000000000000000000000000000000',
          onChange: (event: any) => setPrivateKey(event.currentTarget.value),
        },
        {
          id: 'create-account-salt',
          title: 'Salt (optional)',
          value: salt,
          type: InputType.TextField,
          placeholder: 'E.g. 0x123',
          onChange: (event: any) => setSalt(event.currentTarget.value),
        },
      ],
      action: {
        callback: async () => await createAccount(),
        label: 'Create Account',
      },
      successMessage: 'Smart Contract Account Created',
    },
    {
      name: 'Generate new pk',
      description: 'Custom snap method',
      action: {
        callback: async () => await testCustomMethod(),
        label: 'Test',
      },
      successMessage: 'Account fetched',
    },
  ];

  return (
    <Container>
      <CardContainer>
        {!state.installedSnap && (
          <Card
            content={{
              title: 'Connect',
              description:
                'Get started by connecting to and installing the example snap.',
              button: (
                <ConnectButton
                  onClick={handleConnectClick}
                  disabled={!state.hasMetaMask}
                />
              ),
            }}
            disabled={!state.hasMetaMask}
          />
        )}
      </CardContainer>

      <StyledBox sx={{ flexGrow: 1 }}>
        <Grid container spacing={4} columns={[1, 2, 3]}>
          <Grid item xs={8} sm={4} md={2}>
            {/* Not using this for now*/}
            {/* <DividerTitle>Options</DividerTitle>*/}
            {/* <Toggle*/}
            {/*  title="Use Synchronous Approval"*/}
            {/*  defaultChecked={snapState.useSynchronousApprovals}*/}
            {/*  onToggle={handleUseSyncToggle}*/}
            {/*  enabled={Boolean(state.installedSnap)}*/}
            {/*/ >*/}
            {/* <Divider>&nbsp;</Divider>*/}
            <DividerTitle>Methods</DividerTitle>
            <Accordion items={accountManagementMethods} />
            <Divider />
          </Grid>
        </Grid>
      </StyledBox>
    </Container>
  );
};

export default Index;
