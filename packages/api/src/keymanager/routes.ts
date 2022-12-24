import {ContainerType} from "@chainsafe/ssz";
import {ssz, stringType} from "@lodestar/types";
import {
  ReturnTypes,
  RoutesData,
  Schema,
  reqEmpty,
  ReqSerializers,
  ReqEmpty,
  jsonType,
  ContainerData,
} from "../utils/index.js";

export enum ImportStatus {
  /** Keystore successfully decrypted and imported to keymanager permanent storage */
  imported = "imported",
  /** Keystore's pubkey is already known to the keymanager */
  duplicate = "duplicate",
  /** Any other status different to the above: decrypting error, I/O errors, etc. */
  error = "error",
}

export enum DeletionStatus {
  /** key was active and removed */
  deleted = "deleted",
  /** slashing protection data returned but key was not active */
  not_active = "not_active",
  /** key was not found to be removed, and no slashing data can be returned */
  not_found = "not_found",
  /** unexpected condition meant the key could not be removed (the key was actually found, but we couldn't stop using it) - this would be a sign that making it active elsewhere would almost certainly cause you headaches / slashing conditions etc. */
  error = "error",
}

export enum ImportRemoteKeyStatus {
  /** Remote key successfully imported to validator client permanent storage */
  imported = "imported",
  /** Remote key's pubkey is already known to the validator client */
  duplicate = "duplicate",
  /** Any other status different to the above: I/O errors, etc. */
  error = "error",
}

export enum DeleteRemoteKeyStatus {
  /** key was active and removed */
  deleted = "deleted",
  /** key was not found to be removed */
  not_found = "not_found",
  /**
   * unexpected condition meant the key could not be removed (the key was actually found,
   * but we couldn't stop using it) - this would be a sign that making it active elsewhere would
   * almost certainly cause you headaches / slashing conditions etc.
   */
  error = "error",
}

export type ResponseStatus<Status> = {
  status: Status;
  message?: string;
};

export type FeeRecipientData = {
  pubkey: string;
  ethaddress: string;
};
export type GasLimitData = {
  pubkey: string;
  gasLimit: number;
};

export type SignerDefinition = {
  pubkey: PubkeyHex;
  /**
   * URL to API implementing EIP-3030: BLS Remote Signer HTTP API
   * `"https://remote.signer"`
   */
  url: string;
  /** The signer associated with this pubkey cannot be deleted from the API */
  readonly: boolean;
};

/**
 * JSON serialized representation of a single keystore in EIP-2335: BLS12-381 Keystore format.
 * ```
 * '{"version":4,"uuid":"9f75a3fa-1e5a-49f9-be3d-f5a19779c6fa","path":"m/12381/3600/0/0/0","pubkey":"0x93247f2209abcacf57b75a51dafae777f9dd38bc7053d1af526f220a7489a6d3a2753e5f3e8b1cfe39b56f43611df74a","crypto":{"kdf":{"function":"pbkdf2","params":{"dklen":32,"c":262144,"prf":"hmac-sha256","salt":"8ff8f22ef522a40f99c6ce07fdcfc1db489d54dfbc6ec35613edf5d836fa1407"},"message":""},"checksum":{"function":"sha256","params":{},"message":"9678a69833d2576e3461dd5fa80f6ac73935ae30d69d07659a709b3cd3eddbe3"},"cipher":{"function":"aes-128-ctr","params":{"iv":"31b69f0ac97261e44141b26aa0da693f"},"message":"e8228bafec4fcbaca3b827e586daad381d53339155b034e5eaae676b715ab05e"}}}'
 * ```
 */
export type KeystoreStr = string;

/**
 * JSON serialized representation of the slash protection data in format defined in EIP-3076: Slashing Protection Interchange Format.
 * ```
 * '{"metadata":{"interchange_format_version":"5","genesis_validators_root":"0xcf8e0d4e9587369b2301d0790347320302cc0943d5a1884560367e8208d920f2"},"data":[{"pubkey":"0x93247f2209abcacf57b75a51dafae777f9dd38bc7053d1af526f220a7489a6d3a2753e5f3e8b1cfe39b56f43611df74a","signed_blocks":[],"signed_attestations":[]}]}'
 * ```
 */
export type SlashingProtectionData = string;

/**
 * The validator's BLS public key, uniquely identifying them. _48-bytes, hex encoded with 0x prefix, case insensitive._
 * ```
 * "0x93247f2209abcacf57b75a51dafae777f9dd38bc7053d1af526f220a7489a6d3a2753e5f3e8b1cfe39b56f43611df74a"
 * ```
 */
export type PubkeyHex = string;

export type Api = {
  /**
   * List all validating pubkeys known to and decrypted by this keymanager binary
   *
   * https://github.com/ethereum/keymanager-APIs/blob/0c975dae2ac6053c8245ebdb6a9f27c2f114f407/keymanager-oapi.yaml
   */
  listKeys(): Promise<{
    data: {
      validatingPubkey: PubkeyHex;
      /** The derivation path (if present in the imported keystore) */
      derivationPath?: string;
      /** The key associated with this pubkey cannot be deleted from the API */
      readonly?: boolean;
    }[];
  }>;

  /**
   * Import keystores generated by the Eth2.0 deposit CLI tooling. `passwords[i]` must unlock `keystores[i]`.
   *
   * Users SHOULD send slashing_protection data associated with the imported pubkeys. MUST follow the format defined in
   * EIP-3076: Slashing Protection Interchange Format.
   *
   * @param keystores JSON-encoded keystore files generated with the Launchpad
   * @param passwords Passwords to unlock imported keystore files. `passwords[i]` must unlock `keystores[i]`
   * @param slashingProtection Slashing protection data for some of the keys of `keystores`
   * @returns Status result of each `request.keystores` with same length and order of `request.keystores`
   *
   * https://github.com/ethereum/keymanager-APIs/blob/0c975dae2ac6053c8245ebdb6a9f27c2f114f407/keymanager-oapi.yaml
   */
  importKeystores(
    keystoresStr: KeystoreStr[],
    passwords: string[],
    slashingProtectionStr?: SlashingProtectionData
  ): Promise<{
    data: ResponseStatus<ImportStatus>[];
  }>;

  /**
   * DELETE must delete all keys from `request.pubkeys` that are known to the keymanager and exist in its
   * persistent storage. Additionally, DELETE must fetch the slashing protection data for the requested keys from
   * persistent storage, which must be retained (and not deleted) after the response has been sent. Therefore in the
   * case of two identical delete requests being made, both will have access to slashing protection data.
   *
   * In a single atomic sequential operation the keymanager must:
   * 1. Guarantee that key(s) can not produce any more signature; only then
   * 2. Delete key(s) and serialize its associated slashing protection data
   *
   * DELETE should never return a 404 response, even if all pubkeys from request.pubkeys have no extant keystores
   * nor slashing protection data.
   *
   * Slashing protection data must only be returned for keys from `request.pubkeys` for which a
   * `deleted` or `not_active` status is returned.
   *
   * @param pubkeys List of public keys to delete.
   * @returns Deletion status of all keys in `request.pubkeys` in the same order.
   *
   * https://github.com/ethereum/keymanager-APIs/blob/0c975dae2ac6053c8245ebdb6a9f27c2f114f407/keymanager-oapi.yaml
   */
  deleteKeys(
    pubkeysHex: string[]
  ): Promise<{
    data: ResponseStatus<DeletionStatus>[];
    slashingProtection: SlashingProtectionData;
  }>;

  /**
   * List all remote validating pubkeys known to this validator client binary
   */
  listRemoteKeys(): Promise<{data: SignerDefinition[]}>;

  /**
   * Import remote keys for the validator client to request duties for
   */
  importRemoteKeys(
    remoteSigners: Pick<SignerDefinition, "pubkey" | "url">[]
  ): Promise<{
    data: ResponseStatus<ImportRemoteKeyStatus>[];
  }>;

  deleteRemoteKeys(
    pubkeys: PubkeyHex[]
  ): Promise<{
    data: ResponseStatus<DeleteRemoteKeyStatus>[];
  }>;

  listFeeRecipient(
    pubkey: string
  ): Promise<{
    data: FeeRecipientData;
  }>;
  setFeeRecipient(pubkey: string, ethaddress: string): Promise<void>;
  deleteFeeRecipient(pubkey: string): Promise<void>;

  getGasLimit(
    pubkey: string
  ): Promise<{
    data: GasLimitData;
  }>;
  setGasLimit(pubkey: string, gasLimit: number): Promise<void>;
  deleteGasLimit(pubkey: string): Promise<void>;
};

export const routesData: RoutesData<Api> = {
  listKeys: {url: "/eth/v1/keystores", method: "GET"},
  importKeystores: {url: "/eth/v1/keystores", method: "POST"},
  deleteKeys: {url: "/eth/v1/keystores", method: "DELETE"},

  listRemoteKeys: {url: "/eth/v1/remotekeys", method: "GET"},
  importRemoteKeys: {url: "/eth/v1/remotekeys", method: "POST"},
  deleteRemoteKeys: {url: "/eth/v1/remotekeys", method: "DELETE"},

  listFeeRecipient: {url: "/eth/v1/validator/{pubkey}/feerecipient", method: "GET"},
  setFeeRecipient: {url: "/eth/v1/validator/{pubkey}/feerecipient", method: "POST", statusOk: 202},
  deleteFeeRecipient: {url: "/eth/v1/validator/{pubkey}/feerecipient", method: "DELETE", statusOk: 204},

  getGasLimit: {url: "/eth/v1/validator/{pubkey}/gas_limit", method: "GET"},
  setGasLimit: {url: "/eth/v1/validator/{pubkey}/gas_limit", method: "POST", statusOk: 202},
  deleteGasLimit: {url: "/eth/v1/validator/{pubkey}/gas_limit", method: "DELETE", statusOk: 204},
};

/* eslint-disable @typescript-eslint/naming-convention */

export type ReqTypes = {
  listKeys: ReqEmpty;
  importKeystores: {
    body: {
      keystores: KeystoreStr[];
      passwords: string[];
      slashing_protection?: SlashingProtectionData;
    };
  };
  deleteKeys: {body: {pubkeys: string[]}};

  listRemoteKeys: ReqEmpty;
  importRemoteKeys: {
    body: {
      remote_keys: Pick<SignerDefinition, "pubkey" | "url">[];
    };
  };
  deleteRemoteKeys: {body: {pubkeys: string[]}};

  listFeeRecipient: {params: {pubkey: string}};
  setFeeRecipient: {params: {pubkey: string}; body: {ethaddress: string}};
  deleteFeeRecipient: {params: {pubkey: string}};

  getGasLimit: {params: {pubkey: string}};
  setGasLimit: {params: {pubkey: string}; body: {gas_limit: string}};
  deleteGasLimit: {params: {pubkey: string}};
};

export function getReqSerializers(): ReqSerializers<Api, ReqTypes> {
  return {
    listKeys: reqEmpty,
    importKeystores: {
      writeReq: (keystores, passwords, slashing_protection) => ({body: {keystores, passwords, slashing_protection}}),
      parseReq: ({body: {keystores, passwords, slashing_protection}}) => [keystores, passwords, slashing_protection],
      schema: {body: Schema.Object},
    },
    deleteKeys: {
      writeReq: (pubkeys) => ({body: {pubkeys}}),
      parseReq: ({body: {pubkeys}}) => [pubkeys],
      schema: {body: Schema.Object},
    },

    listRemoteKeys: reqEmpty,
    importRemoteKeys: {
      writeReq: (remote_keys) => ({body: {remote_keys}}),
      parseReq: ({body: {remote_keys}}) => [remote_keys],
      schema: {body: Schema.Object},
    },
    deleteRemoteKeys: {
      writeReq: (pubkeys) => ({body: {pubkeys}}),
      parseReq: ({body: {pubkeys}}) => [pubkeys],
      schema: {body: Schema.Object},
    },

    listFeeRecipient: {
      writeReq: (pubkey) => ({params: {pubkey}}),
      parseReq: ({params: {pubkey}}) => [pubkey],
      schema: {
        params: {pubkey: Schema.StringRequired},
      },
    },
    setFeeRecipient: {
      writeReq: (pubkey, ethaddress) => ({params: {pubkey}, body: {ethaddress}}),
      parseReq: ({params: {pubkey}, body: {ethaddress}}) => [pubkey, ethaddress],
      schema: {
        params: {pubkey: Schema.StringRequired},
        body: Schema.Object,
      },
    },
    deleteFeeRecipient: {
      writeReq: (pubkey) => ({params: {pubkey}}),
      parseReq: ({params: {pubkey}}) => [pubkey],
      schema: {
        params: {pubkey: Schema.StringRequired},
      },
    },

    getGasLimit: {
      writeReq: (pubkey) => ({params: {pubkey}}),
      parseReq: ({params: {pubkey}}) => [pubkey],
      schema: {
        params: {pubkey: Schema.StringRequired},
      },
    },
    setGasLimit: {
      writeReq: (pubkey, gasLimit) => ({params: {pubkey}, body: {gas_limit: gasLimit.toString(10)}}),
      parseReq: ({params: {pubkey}, body: {gas_limit}}) => [pubkey, parseGasLimit(gas_limit)],
      schema: {
        params: {pubkey: Schema.StringRequired},
        body: Schema.Object,
      },
    },
    deleteGasLimit: {
      writeReq: (pubkey) => ({params: {pubkey}}),
      parseReq: ({params: {pubkey}}) => [pubkey],
      schema: {
        params: {pubkey: Schema.StringRequired},
      },
    },
  };
}

/* eslint-disable @typescript-eslint/naming-convention */
export function getReturnTypes(): ReturnTypes<Api> {
  return {
    listKeys: jsonType("snake"),
    importKeystores: jsonType("snake"),
    deleteKeys: jsonType("snake"),

    listRemoteKeys: jsonType("snake"),
    importRemoteKeys: jsonType("snake"),
    deleteRemoteKeys: jsonType("snake"),

    listFeeRecipient: jsonType("snake"),
    getGasLimit: ContainerData(
      new ContainerType(
        {
          pubkey: stringType,
          gasLimit: ssz.UintNum64,
        },
        {jsonCase: "eth2"}
      )
    ),
  };
}

function parseGasLimit(gasLimitInput: string | number): number {
  if ((typeof gasLimitInput !== "string" && typeof gasLimitInput !== "number") || `${gasLimitInput}`.trim() === "") {
    throw Error("Not valid Gas Limit");
  }
  const gasLimit = Number(gasLimitInput);
  if (Number.isNaN(gasLimit) || gasLimit === 0) {
    throw Error(`Gas Limit is not valid gasLimit=${gasLimit}`);
  }
  return gasLimit;
}
