# Monitoring and timeout handling

## monitoring

TODO

## job locks

TODO

## why we have a separate service

A separate service ([queue-monitor](https://github.com/agoraxyz/queue-monitor/)) is responsible for periodically fetching the queues' items from Redis. The `LRANGE` command - which is used to get the elements of a list - has a time complexity of O(N) (where N is the length of the list). This makes it relatively expensive, so periodically calling it from X different pods would generate unnecessary load.

On the other hand we want to check if a job (or rather the lock key associated with it) is expired. In such cases the job should be marked as expired, and it would be ideal if this expiration "event" is handled once instead of X times.
