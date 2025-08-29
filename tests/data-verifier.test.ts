import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface ValidationRecord {
  isValid: boolean;
  qualityScore: number;
  validator: string;
  timestamp: number;
}

interface OracleRecord {
  active: boolean;
  addedAt: number;
  validationCount: number;
}

interface DataSubmissionMock {
  getDataHash(dataId: number): ClarityResponse<Buffer>;
  getDataSubmitter(dataId: number): ClarityResponse<string>;
  getDataTimestamp(dataId: number): ClarityResponse<number>;
}

// Mock DataSubmission contract
class DataSubmissionMock implements DataSubmissionMock {
  private data: Map<number, {hash: Buffer, submitter: string, timestamp: number}>;

  constructor() {
    this.data = new Map();
  }

  setData(dataId: number, hash: Buffer, submitter: string, timestamp: number) {
    this.data.set(dataId, {hash, submitter, timestamp});
  }

  getDataHash(dataId: number): ClarityResponse<Buffer> {
    const entry = this.data.get(dataId);
    return entry 
      ? {ok: true, value: entry.hash}
      : {ok: false, value: 101};
  }

  getDataSubmitter(dataId: number): ClarityResponse<string> {
    const entry = this.data.get(dataId);
    return entry 
      ? {ok: true, value: entry.submitter}
      : {ok: false, value: 101};
  }

  getDataTimestamp(dataId: number): ClarityResponse<number> {
    const entry = this.data.get(dataId);
    return entry 
      ? {ok: true, value: entry.timestamp}
      : {ok: false, value: 101};
  }
}

// Mock DataVerifier contract
class DataVerifierMock {
  private state: {
    paused: boolean;
    admin: string;
    oracleCount: number;
    oracles: Map<string, OracleRecord>;
    dataValidity: Map<number, ValidationRecord>;
    userValidationHistory: Map<string, number[]>;
    oracleValidations: Map<string, number[]>;
    dailyValidations: Map<number, number>;
  };

  private ERR_NOT_AUTHORIZED = 100;
  private ERR_INVALID_DATA = 101;
  private ERR_PAUSED = 102;
  private ERR_INVALID_ORACLE = 103;
  private ERR_ALREADY_VALIDATED = 104;
  private ERR_INVALID_QUALITY = 105;
  private ERR_INVALID_TIMESTAMP = 106;
  private MAX_QUALITY_SCORE = 100;
  private VALIDATION_WINDOW = 288;
  private MAX_ORACLES = 5;

  constructor(private dataSubmission: DataSubmissionMock) {
    this.state = {
      paused: false,
      admin: "deployer",
      oracleCount: 0,
      oracles: new Map(),
      dataValidity: new Map(),
      userValidationHistory: new Map(),
      oracleValidations: new Map(),
      dailyValidations: new Map(),
    };
  }

  verifyData(caller: string, dataId: number, oracleDataHash: Buffer, qualityScore: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return {ok: false, value: this.ERR_PAUSED};
    }
    const oracle = this.state.oracles.get(caller);
    if (!oracle?.active) {
      return {ok: false, value: this.ERR_NOT_AUTHORIZED};
    }
    if (qualityScore > this.MAX_QUALITY_SCORE) {
      return {ok: false, value: this.ERR_INVALID_QUALITY};
    }
    if (this.state.dataValidity.has(dataId)) {
      return {ok: false, value: this.ERR_ALREADY_VALIDATED};
    }
    const data = this.dataSubmission.getDataHash(dataId);
    const submitter = this.dataSubmission.getDataSubmitter(dataId);
    const timestamp = this.dataSubmission.getDataTimestamp(dataId);
    if (!data.ok || !submitter.ok || !timestamp.ok) {
      return {ok: false, value: this.ERR_INVALID_DATA};
    }
    if (timestamp.value < (Math.floor(Date.now() / 1000) - this.VALIDATION_WINDOW * 600)) {
      return {ok: false, value: this.ERR_INVALID_TIMESTAMP};
    }
    if (!oracleDataHash.equals(data.value)) {
      return {ok: false, value: this.ERR_INVALID_DATA};
    }
    this.state.dataValidity.set(dataId, {
      isValid: true,
      qualityScore,
      validator: caller,
      timestamp: Math.floor(Date.now() / 1000),
    });
    const userHistory = this.state.userValidationHistory.get(submitter.value) ?? [];
    this.state.userValidationHistory.set(submitter.value, [...userHistory, dataId]);
    const oracleHistory = this.state.oracleValidations.get(caller) ?? [];
    this.state.oracleValidations.set(caller, [...oracleHistory, dataId]);
    const day = Math.floor(Math.floor(Date.now() / 1000) / (144 * 600));
    this.state.dailyValidations.set(day, (this.state.dailyValidations.get(day) ?? 0) + 1);
    oracle.validationCount += 1;
    this.state.oracles.set(caller, oracle);
    return {ok: true, value: true};
  }

  invalidateData(caller: string, dataId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return {ok: false, value: this.ERR_PAUSED};
    }
    const oracle = this.state.oracles.get(caller);
    if (!oracle?.active) {
      return {ok: false, value: this.ERR_NOT_AUTHORIZED};
    }
    if (this.state.dataValidity.has(dataId)) {
      return {ok: false, value: this.ERR_ALREADY_VALIDATED};
    }
    const submitter = this.dataSubmission.getDataSubmitter(dataId);
    const timestamp = this.dataSubmission.getDataTimestamp(dataId);
    if (!submitter.ok || !timestamp.ok) {
      return {ok: false, value: this.ERR_INVALID_DATA};
    }
    if (timestamp.value < (Math.floor(Date.now() / 1000) - this.VALIDATION_WINDOW * 600)) {
      return {ok: false, value: this.ERR_INVALID_TIMESTAMP};
    }
    this.state.dataValidity.set(dataId, {
      isValid: false,
      qualityScore: 0,
      validator: caller,
      timestamp: Math.floor(Date.now() / 1000),
    });
    const userHistory = this.state.userValidationHistory.get(submitter.value) ?? [];
    this.state.userValidationHistory.set(submitter.value, [...userHistory, dataId]);
    const oracleHistory = this.state.oracleValidations.get(caller) ?? [];
    this.state.oracleValidations.set(caller, [...oracleHistory, dataId]);
    const day = Math.floor(Math.floor(Date.now() / 1000) / (144 * 600));
    this.state.dailyValidations.set(day, (this.state.dailyValidations.get(day) ?? 0) + 1);
    oracle.validationCount += 1;
    this.state.oracles.set(caller, oracle);
    return {ok: true, value: true};
  }

  addOracle(caller: string, oracle: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return {ok: false, value: this.ERR_NOT_AUTHORIZED};
    }
    if (this.state.oracleCount >= this.MAX_ORACLES) {
      return {ok: false, value: this.ERR_INVALID_ORACLE};
    }
    const existing = this.state.oracles.get(oracle);
    if (existing?.active) {
      return {ok: false, value: this.ERR_INVALID_ORACLE};
    }
    this.state.oracles.set(oracle, {active: true, addedAt: Math.floor(Date.now() / 1000), validationCount: 0});
    this.state.oracleCount += 1;
    return {ok: true, value: true};
  }

  removeOracle(caller: string, oracle: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return {ok: false, value: this.ERR_NOT_AUTHORIZED};
    }
    const oracleRecord = this.state.oracles.get(oracle);
    if (!oracleRecord?.active) {
      return {ok: false, value: this.ERR_INVALID_ORACLE};
    }
    this.state.oracles.set(oracle, {...oracleRecord, active: false});
    this.state.oracleCount -= 1;
    return {ok: true, value: true};
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return {ok: false, value: this.ERR_NOT_AUTHORIZED};
    }
    this.state.paused = true;
    return {ok: true, value: true};
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return {ok: false, value: this.ERR_NOT_AUTHORIZED};
    }
    this.state.paused = false;
    return {ok: true, value: true};
  }

  setDataSubmissionContract(caller: string, _newContract: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return {ok: false, value: this.ERR_NOT_AUTHORIZED};
    }
    return {ok: true, value: true};
  }

  isDataValid(dataId: number): ClarityResponse<boolean> {
    const entry = this.state.dataValidity.get(dataId);
    return {ok: true, value: entry?.isValid ?? false};
  }

  getDataQuality(dataId: number): ClarityResponse<number> {
    const entry = this.state.dataValidity.get(dataId);
    return entry 
      ? {ok: true, value: entry.qualityScore}
      : {ok: false, value: this.ERR_INVALID_DATA};
  }

  getValidationDetails(dataId: number): ClarityResponse<ValidationRecord | null> {
    return {ok: true, value: this.state.dataValidity.get(dataId) ?? null};
  }

  getUserValidationHistory(user: string): ClarityResponse<number[]> {
    return {ok: true, value: this.state.userValidationHistory.get(user) ?? []};
  }

  getOracleValidations(oracle: string): ClarityResponse<number[]> {
    return {ok: true, value: this.state.oracleValidations.get(oracle) ?? []};
  }

  getDailyValidations(day: number): ClarityResponse<number> {
    return {ok: true, value: this.state.dailyValidations.get(day) ?? 0};
  }

  isOracle(oracle: string): ClarityResponse<boolean> {
    return {ok: true, value: !!this.state.oracles.get(oracle)?.active};
  }

  getOracleCount(): ClarityResponse<number> {
    return {ok: true, value: this.state.oracleCount};
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  oracle1: "oracle1",
  oracle2: "oracle2",
  user1: "user1",
  user2: "user2",
};

describe("DataVerifier Contract", () => {
  let dataSubmission: DataSubmissionMock;
  let contract: DataVerifierMock;

  beforeEach(() => {
    dataSubmission = new DataSubmissionMock();
    contract = new DataVerifierMock(dataSubmission);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 7, 29));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow admin to add oracle", () => {
    const addOracle = contract.addOracle(accounts.deployer, accounts.oracle1);
    expect(addOracle).toEqual({ok: true, value: true});
    expect(contract.isOracle(accounts.oracle1)).toEqual({ok: true, value: true});
    expect(contract.getOracleCount()).toEqual({ok: true, value: 1});
  });

  it("should prevent non-admin from adding oracle", () => {
    const addOracle = contract.addOracle(accounts.user1, accounts.oracle1);
    expect(addOracle).toEqual({ok: false, value: 100});
  });

  it("should prevent adding more than max oracles", () => {
    for (let i = 1; i <= 5; i++) {
      contract.addOracle(accounts.deployer, `oracle${i}`);
    }
    const addOracle = contract.addOracle(accounts.deployer, accounts.oracle2);
    expect(addOracle).toEqual({ok: false, value: 103});
  });

  it("should allow oracle to verify valid data", () => {
    const dataId = 1;
    const dataHash = Buffer.from("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", "hex");
    dataSubmission.setData(dataId, dataHash, accounts.user1, Math.floor(Date.now() / 1000));
    contract.addOracle(accounts.deployer, accounts.oracle1);

    const verifyResult = contract.verifyData(accounts.oracle1, dataId, dataHash, 80);
    expect(verifyResult).toEqual({ok: true, value: true});
    expect(contract.isDataValid(dataId)).toEqual({ok: true, value: true});
    expect(contract.getDataQuality(dataId)).toEqual({ok: true, value: 80});
    expect(contract.getValidationDetails(dataId)).toEqual({
      ok: true,
      value: expect.objectContaining({isValid: true, qualityScore: 80, validator: accounts.oracle1}),
    });
    expect(contract.getUserValidationHistory(accounts.user1)).toEqual({ok: true, value: [dataId]});
    expect(contract.getOracleValidations(accounts.oracle1)).toEqual({ok: true, value: [dataId]});
    expect(contract.getDailyValidations(Math.floor(Math.floor(Date.now() / 1000) / (144 * 600)))).toEqual({ok: true, value: 1});
  });

  it("should prevent non-oracle from verifying data", () => {
    const verifyResult = contract.verifyData(accounts.user1, 1, Buffer.alloc(32), 80);
    expect(verifyResult).toEqual({ok: false, value: 100});
  });

  it("should prevent verifying already validated data", () => {
    const dataId = 1;
    const dataHash = Buffer.alloc(32);
    dataSubmission.setData(dataId, dataHash, accounts.user1, Math.floor(Date.now() / 1000));
    contract.addOracle(accounts.deployer, accounts.oracle1);
    contract.verifyData(accounts.oracle1, dataId, dataHash, 80);

    const verifyResult = contract.verifyData(accounts.oracle1, dataId, dataHash, 80);
    expect(verifyResult).toEqual({ok: false, value: 104});
  });

  it("should prevent verifying with invalid hash", () => {
    const dataId = 1;
    const dataHash = Buffer.alloc(32);
    dataSubmission.setData(dataId, dataHash, accounts.user1, Math.floor(Date.now() / 1000));
    contract.addOracle(accounts.deployer, accounts.oracle1);

    const verifyResult = contract.verifyData(accounts.oracle1, dataId, Buffer.alloc(32, 1), 80);
    expect(verifyResult).toEqual({ok: false, value: 101});
  });

  it("should prevent verifying outdated data", () => {
    const dataId = 1;
    const dataHash = Buffer.alloc(32);
    dataSubmission.setData(dataId, dataHash, accounts.user1, Math.floor(Date.now() / 1000) - (300 * 600));
    contract.addOracle(accounts.deployer, accounts.oracle1);

    const verifyResult = contract.verifyData(accounts.oracle1, dataId, dataHash, 80);
    expect(verifyResult).toEqual({ok: false, value: 106});
  });

  it("should allow oracle to invalidate data", () => {
    const dataId = 1;
    const dataHash = Buffer.alloc(32);
    dataSubmission.setData(dataId, dataHash, accounts.user1, Math.floor(Date.now() / 1000));
    contract.addOracle(accounts.deployer, accounts.oracle1);

    const invalidateResult = contract.invalidateData(accounts.oracle1, dataId);
    expect(invalidateResult).toEqual({ok: true, value: true});
    expect(contract.isDataValid(dataId)).toEqual({ok: true, value: false});
    expect(contract.getDataQuality(dataId)).toEqual({ok: true, value: 0});
  });

  it("should allow admin to pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ok: true, value: true});

    const verifyResult = contract.verifyData(accounts.oracle1, 1, Buffer.alloc(32), 80);
    expect(verifyResult).toEqual({ok: false, value: 102});

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ok: true, value: true});
  });

  it("should prevent non-admin from pausing contract", () => {
    const pauseResult = contract.pauseContract(accounts.user1);
    expect(pauseResult).toEqual({ok: false, value: 100});
  });

  it("should allow admin to update data submission contract", () => {
    const setContractResult = contract.setDataSubmissionContract(accounts.deployer, "new-contract");
    expect(setContractResult).toEqual({ok: true, value: true});
  });
});