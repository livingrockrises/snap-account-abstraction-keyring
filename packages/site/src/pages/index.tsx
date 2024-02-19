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
  const [guardianId, setGuardianId] = useState<string | null>();
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
      privateKey: guardianId as string,
    });
    await syncAccounts();
    return newAccount;
  };

  // UserOp methods (default to send from first AA account created)
  // Note: Could be used to set paymasterUrl (if getPaymasterAndData only requires userOp) or provide fee mode, preferred fee token, bundler url etc
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

  // UserOp methods (default to send from first AA account created)
  // const setAccountRecovery = async (guardianInfo) => {
  //   const request: KeyringRequest = {
  //     id: uuid.v4(),
  //     scope: '',
  //     account: uuid.v4(),
  //     request: {
  //       method: 'snap.account.setRecovery',
  //       params: [JSON.parse(guardianInfo)],
  //     },
  //   };
  //   await client.submitRequest(request);
  // };

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
      description: 'Create a 4337 account with social recovery',
      inputs: [
        {
          id: 'create-account-guardian',
          title: 'Guardian Address / Id',
          value: guardianId,
          type: InputType.TextField,
          placeholder:
            'E.g. 0000000000000000000000000000000000000000000000000000000000000000',
          onChange: (event: any) => setGuardianId(event.currentTarget.value),
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
            <DividerTitle>UserOp Methods</DividerTitle>
            <Accordion items={userOpMethods} />
            <Divider />
          </Grid>
        </Grid>
      </StyledBox>
    </Container>
  );
};

export default Index;
