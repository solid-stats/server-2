export const parserExchange = "solid_stats.parser";

export const parseRequestedRoutingKey = "parse.requested";

export const parseCompletedRoutingKey = "parse.completed";

export const parseFailedRoutingKey = "parse.failed";

export interface Sha256Checksum {
  algorithm: "sha256";
  value: string;
}

export interface ParseRequestMessage {
  job_id: string;
  replay_id: string;
  object_key: string;
  checksum: Sha256Checksum;
  parser_contract_version: string;
}

export interface ParseCompletedMessage {
  message_type: "parse.completed";
  job_id: string;
  replay_id: string;
  parser_contract_version: string;
  source_checksum: Sha256Checksum;
  artifact: {
    bucket: string;
    key: string;
  };
  artifact_checksum: Sha256Checksum;
  artifact_size_bytes: number;
  parser?: {
    name: string;
    version: string;
  };
}

export interface ParseFailedMessage {
  message_type: "parse.failed";
  job_id: PresentField<string>;
  replay_id: PresentField<string>;
  object_key?: PresentField<string>;
  parser_contract_version: PresentField<string>;
  source_checksum?: PresentField<Sha256Checksum>;
  failure: {
    error_code: string;
    message: string;
    retryability: "retryable" | "not_retryable";
    stage: string;
  };
  parser?: {
    name: string;
    version: string;
  };
}

export interface PresentField<T> {
  state: "present";
  value: T;
}

export interface ConfirmingPublisher {
  publishJson(
    exchange: string,
    routingKey: string,
    payload: ParseRequestMessage,
  ): Promise<void>;
}
