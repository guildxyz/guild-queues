// prefixes for redis keys to easily identify keys
export const QUEUE_KEY_PREFIX = "queue";
export const LOCK_KEY_PREFIX = "lock";
export const JOB_KEY_PREFIX = "job";
export const COUNTER_KEY_PREFIX = "counter";

// lease a job for this amount of time
export const DEFAULT_LOCK_SEC = 60 * 3;
// wait this amount of time for jobs before checking if the worker is still running
export const DEFAULT_WAIT_TIMEOUT_SEC = 3;
// the parent checks if the child jobs are running this often
export const DEFAULT_PARENT_CHECK_INTERVAL_MS = 1000;
// almost all of the keys should expire one day to prevent filling the redis with garbage
export const DEFAULT_KEY_EXPIRY_SEC = 60 * 60 * 24;
// additional seconds for the lock key expiration to prevent marking the job failed immediately before finishing it
export const EXTRA_LOCK_SEC = 1;
// this metadata should be included in all logs
export const DEFAULT_LOG_META = { queues: true };
export const DEFAULT_PRIORITY = 1;

// field indicating that the job will not be executed / changed, it's flow finished
export const DONE_FIELD = "done";
// field indicating the job encountered an error and there's no result
export const FAILED_FIELD = "failed";
// the name of the queue where the job encountered an error
export const FAILED_QUEUE_FIELD = "failedQueue";
// the message of the encountered error
export const FAILED_ERROR_MSG_FIELD = "failedErrorMsg";

// whether the job is currently delayed
export const IS_DELAY_FIELD = "delay";
// the time when the delayed job will be ready to execute again
export const DELAY_TIMESTAMP_FIELD = "delayReadyTimestamp";
// the reason why the job was delayed
export const DELAY_REASON_FIELD = "delayReason";
