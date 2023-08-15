# Flows

## Creating the flow

<sub>_tl;dr: an example can be found [here](../src/access/getAccessFlow.ts)_</sub>

constructing a flow object requires

- a FlowOptions object which contains parameters like
  - the flow's name,
  - logger instance
  - and the QueueOptions which describes the flow's queues and their lookup attributes, optionally the nextQueues and the child queues
- furthermore the Flow is a generic class, so we need to provide the type attributes
  - the first generic param should be a union type of the flow's jobs
  - the second one is the type of the parameter object used for creating the jobs
  - the third one is a subset of the second one's keys, which can be used as [lookup attributes](./lookup_attributes.md)

---

## Fetching jobs

### method

- `Flow.getJobsByKey`

### params

the job fetching is done by the [lookup attributes](./lookup_attributes.md)

- keyName, which is the name of the lookup attribute
- value, which is the value of the lookup attribute
- resolveChildren, whether the child jobs should be also fetched (not just their ids)

### flow

- first the job ids are fetched by the lookup keys
- then the job hashes are fetched by their ids
- more details [here](./lookup_attributes.md)

---

## Job creation

### method

- `Flow.createJob`

### params

- options object, basically the job itself
- [the `lookupAttributes` property has a significant role](./lookup_attributes.md)

### flow

- first a UUID is generated for the job
- a redis transaction will save the job
  - the job hash is saved
    - `HSET job:<flowName>:<jobId> key1 value1 key2 value2 ...`
  - its TTL is sat
    - `EXPIRE job:<flowName>:<jobId>`
  - then the lookup attributes are pushed to their lists and the lists's TTLs are also updated
    - `RPUSH job:<flowName>:<propertyKey>:<propertyValue> <jobId>`
    - `EXPIRE job:<flowName>:<propertyKey>:<propertyValue>`
    - if the lookup attribute's value is an array, multiple lookup keys will be saved for each element in the array
    - if the lookup attribute's value is a string or a number, it will be saved in a single lookup list
    - other types will be ignored
  - finally the job's id will be pushed to the flow's first waiting queue
    - `RPUSH queue:<queueName>:<stage> <jobId>`
- the method will return the job's id

---

## Creating workers

### method

- `Flow.createWorkers` or `Flow.createParentWorkers` or `Flow.createChildWorkers`

### flow

- the job's type if passed by the generic param
- the job's name and the workerFunction is passed with regular params

---

## Starting/stopping the execution

### method

- `Flow.startAll` or `Flow.stopAll`

### flow

- first the Flow's redis client will connect to the redis server
- then all the workers
  - will connect
  - then start the execution
- the stop flow is the same, but in the reverse order: workers stop, workers disconnect, flow disconnects
- the workers can be started/stopped manually with their start/stop methods

---
