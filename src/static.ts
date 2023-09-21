// prefixes for redis keys to easily identify keys
export const QUEUE_KEY_PREFIX = "queue";
export const LOCK_KEY_PREFIX = "lock";
export const JOB_KEY_PREFIX = "job";

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
