import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { KeyringSnapRpcClient } from '@metamask/keyring-api';
import Grid from '@mui/material/Grid';
import { ethers } from 'ethers';
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
import {
  ACCOUNT_RECOVERY_MODULE_ADDRESS,
  BICONOMY_SDK_NFT_MULTICHAIN_ADDRESS,
} from '../config/constants';
import { MetamaskActions, MetaMaskContext } from '../hooks';
import { InputType } from '../types';
import type { KeyringState } from '../utils';
import { connectSnap, getSnap, isSynchronousMode } from '../utils';
import { BiconomyAccountRecoveryAbi } from '../utils/abi/BiconomyAccountRecoveryAbi';
import { BiconomyImplementationAbi } from '../utils/abi/BiconomyImplementationAbi';
import { getMessageToSignByGuardian } from '../utils/accountRecovery';

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
  const [accountAddress, setAccountAddress] = useState<string | null>();
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
    });
    await syncAccounts();
    setAccountAddress(newAccount.address);
    // Review
    await window.ethereum.request({ method: 'eth_requestAccounts' });
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
  const setAccountRecoveryExperimental = async (
    /* recoveryDetails: string*/ guardianIdPassed: string,
  ) => {
    const accounts: any = await ethereum.request({ method: 'eth_accounts' });
    console.log('current selected account ', accounts[0]);
    const recoveryInfo = {
      guardianId: guardianIdPassed,
      accountAddress: accounts[0],
      validUntil: 1740078291,
      securityDelay: 15,
      numRecoveries: 1,
    };
    const request: KeyringRequest = {
      id: uuid.v4(),
      scope: '',
      account: uuid.v4(),
      request: {
        method: 'snap.account.setRecovery',
        params: [recoveryInfo],
      },
    };
    await client.submitRequest(request);
  };

  const mintNFT = async () => {
    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    const signer = provider.getSigner();
    const accounts: any = await ethereum.request({ method: 'eth_accounts' });

    const nftInterface = new ethers.utils.Interface([
      'function safeMint(address _to)',
    ]);

    const nftContract = new ethers.Contract(
      BICONOMY_SDK_NFT_MULTICHAIN_ADDRESS,
      nftInterface,
      signer,
    );

    await nftContract.safeMint(accounts[0]);
  };

  const setAccountRecoveryFromCompanionDapp = async (
    guardianIdPassed: string,
  ) => {
    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    const signer = provider.getSigner();
    const accounts: any = await ethereum.request({ method: 'eth_accounts' });
    // const address = await signer.getAddress();

    const accountRecoveryInterface = new ethers.utils.Interface(
      BiconomyAccountRecoveryAbi,
    );

    const guardian = guardianIdPassed ?? guardianId;

    const accountRecoverySetupData =
      accountRecoveryInterface.encodeFunctionData('initForSmartAccount', [
        [guardian],
        [[16741936496, 0]], // validUntil = 1 year from now, validAfter = 0
        1, // recoveryThreshold = length of guardians (in this case 1)
        15, // secruity delay
        1, // num recoveries allowed
      ]);

    console.log('accountRecoverySetupData', accountRecoverySetupData);

    const smartAccountInterface = new ethers.utils.Interface(
      BiconomyImplementationAbi,
    );

    // const setUpAndEnableModuleData = smartAccountInterface.encodeFunctionData(
    //   'setUpAndEnableModule',
    //   [ACCOUNT_RECOVERY_MODULE_ADDRESS, accountRecoverySetupData],
    // );

    // console.log('setUpAndEnableModuleData', setUpAndEnableModuleData);

    const smartAccount = new ethers.Contract(
      accounts[0],
      smartAccountInterface,
      signer,
    );

    await smartAccount.setupAndEnableModule(
      ACCOUNT_RECOVERY_MODULE_ADDRESS,
      accountRecoverySetupData,
    );
  };

  // const testCustomMethod = async () => {
  //   const response = await window.ethereum.request({
  //     method: 'wallet_invokeSnap',
  //     params: {
  //       snapId: defaultSnapOrigin,
  //       request: { method: 'genPk' },
  //     },
  //   });
  //   console.log('response', response);
  //   return response;
  // };

  const signMessage = async (message: any) => {
    // Notice: this could be done rather at beginning / After every createAccount
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    const provider = new ethers.providers.Web3Provider(window.ethereum as any);
    const signer = provider.getSigner();
    const response = await signer.signMessage(ethers.utils.arrayify(message));
    console.log('sig', response);
    return response;
  };

  const signAndSetGuardianId = async (smartAccount: string) => {
    console.log('SA address being passed here ', smartAccount);
    const message = await getMessageToSignByGuardian(smartAccount);
    const signature: any = await signMessage(message);
    console.log('signature', signature);
    const guardianIdComputed = ethers.utils.keccak256(signature);
    console.log('guardianIdComputed', guardianIdComputed);
    setGuardianId(guardianIdComputed);
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
          id: 'create-account-private-key',
          title: 'Private key (optional)',
          value: privateKey,
          type: InputType.TextField,
          placeholder:
            'E.g. 0000000000000000000000000000000000000000000000000000000000000000',
          onChange: (event: any) => setPrivateKey(event.currentTarget.value),
        },
      ],
      action: {
        callback: async () => await createAccount(),
        label: 'Create Account',
      },
      successMessage: 'Smart Contract Account Created',
    },
    {
      name: 'Sign a Message by Guardian',
      description: 'Getting a Guardian Id',
      inputs: [
        {
          id: 'smart account address',
          title: "Friend's SA address",
          value: accountAddress,
          type: InputType.TextField,
          placeholder: 'E.g. 0x4E720e21D8BEFA24da71F2eacE864137e0166C6C',
          onChange: (event: any) =>
            setAccountAddress(event.currentTarget.value),
        },
      ],
      action: {
        callback: async () =>
          await signAndSetGuardianId(accountAddress as string),
        label: 'Onboard guardian',
      },
      successMessage: guardianId,
    },
    // {
    //   name: 'Setup Recovery (Experimental)',
    //   description:
    //     'Setting up recovery on chain using set guardian (Custom Keyring API)',
    //   inputs: [
    //     {
    //       id: 'smart account guardian id',
    //       title: 'Generated guardian Id',
    //       value: guardianId,
    //       type: InputType.TextField,
    //       placeholder:
    //         'E.g. 0x4277a27c57e92d7f5f7d8b31b887d63eca97cfb3a94fcecbf647cb13258dc76a',
    //       onChange: (event: any) =>
    //         setAccountAddress(event.currentTarget.value),
    //     },
    //   ],
    //   action: {
    //     callback: async () =>
    //       await setAccountRecoveryExperimental(guardianId as string),
    //     label: 'Set Recovery',
    //   },
    // },
    {
      name: 'Setup Recovery',
      description: 'Setting up recovery on chain using set guardian',
      inputs: [
        {
          id: 'smart account guardian id',
          title: 'Generated guardian Id',
          value: guardianId,
          type: InputType.TextField,
          placeholder:
            'E.g. 0x4277a27c57e92d7f5f7d8b31b887d63eca97cfb3a94fcecbf647cb13258dc76a',
          onChange: (event: any) => setGuardianId(event.currentTarget.value),
        },
      ],
      action: {
        callback: async () =>
          await setAccountRecoveryFromCompanionDapp(guardianId as string),
        label: 'Set Recovery',
      },
    },
    // {
    //   name: 'Generate new pk',
    //   description: 'Custom snap method',
    //   action: {
    //     callback: async () => await testCustomMethod(),
    //     label: 'Test',
    //   },
    // },
    {
      name: 'Mint NFT',
      description: 'Mint NFT',
      action: {
        callback: async () => await mintNFT(),
        label: 'Mint',
      },
      successMessage: 'Sending UserOp to Mint an NFT',
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
            {/* Your existing JSX */}
            {/* Add the new JSX here */}
            {guardianId && (
              <div>
                <p>Guardian ID: {guardianId}</p>
              </div>
            )}
          </Grid>
        </Grid>
      </StyledBox>

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
