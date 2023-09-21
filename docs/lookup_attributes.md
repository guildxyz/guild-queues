# Lookup attributes

A job is stored in a hash its key contains the job's id, so the job can be fetched by its id. Furthermore we would like to query jobs by some of it's properties so additional lookup keys are created.

The job's `lookupAttributes` property has a significant role.

- it's an array in the CreateJobOptions object which contains a subset of the job's keys
- the job can be fetched by these keys (and ofc the id)
- for example
  - the `person` flow has a job: `{name: "Joe", age: 23}`
  - the lookup attributes array is `["name"]`
  - than the jobs with `name = "Joe"` can by fetched by\
    `LRANGE job:person:name:Joe 0 -1`
    - this will return an array of job ids
  - then the the job can be fetched by\
    `HGETALL job:person:<the id we found>`
- as we see, the lookup keys are represented as lists in redis, because the jobs' properties aren't unique, theoretically there can be multiple jobs with the `name = "Joe"`
- lookup attribute key syntax: \
  `job:<flowName>:<propertyKey>:<propertyValue>` (list)
  - and its value will be an array of job ids
- with the job id, the job can easily fetched by\
  `job:<flowName>:<jobId>` (hash)
- the creation of lookup attributes is automatic in the [job creation](./flows.md#job-creation)
