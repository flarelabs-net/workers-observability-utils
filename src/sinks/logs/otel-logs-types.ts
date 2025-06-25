export interface KeyValue {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

export interface InstrumentationScope {
  name: string;
  version?: string;
}

export interface Resource {
  attributes: KeyValue[];
}

export enum SeverityNumber {
  SEVERITY_NUMBER_UNSPECIFIED = 0,
  SEVERITY_NUMBER_TRACE = 1,
  SEVERITY_NUMBER_DEBUG = 5,
  SEVERITY_NUMBER_INFO = 9,
  SEVERITY_NUMBER_WARN = 13,
  SEVERITY_NUMBER_ERROR = 17,
  SEVERITY_NUMBER_FATAL = 21,
}

export interface LogRecord {
  timeUnixNano: string;
  severityNumber?: SeverityNumber;
  severityText?: string;
  body?: {
    stringValue?: string;
    kvlistValue?: {
      values: KeyValue[];
    };
  };
  attributes?: KeyValue[];
  traceId?: string;
  spanId?: string;
}

export interface ScopeLogs {
  scope: InstrumentationScope;
  logRecords: LogRecord[];
}

export interface ResourceLogs {
  resource: Resource;
  scopeLogs: ScopeLogs[];
}

export interface OTLPLogsPayload {
  resourceLogs: ResourceLogs[];
}