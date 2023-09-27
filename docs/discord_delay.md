## Discord delay

We can make 10 member role update requests per 10 seconds to Discord.
Bottleneck.js can ensure that we only send 10 requests in every 10 seconds, and it can also tell us if a request was added right now would it run immediately. If it wouldn't run immediately bottleneck can tell us the next request timestamp (the start of the next 10 second time window). So if we know the next time windows and how many requests are waiting for execution we can estimate the timestamp when the new request will be ready to execute:<br> `readyTimestamp = nextRequestTimestamp + Math.floor(REQUESTS_WAITING/REQUESTS_PER_WINDOW)*TIME_WINDOW` <br>
(we basically estimate the start of the time window when the request can be executed, note: request can be executed _concurrently_)

```mermaid
flowchart TD
    A[Start] --> B{Can it run immediately?}
    B -->|Yes| C{Was it delayed?}
    C -->|Yes| H["DECR counter:delayed:discord:{discordServerId}"]
    C -->|No| I["Run job"]
    H --> I
    B -->|No| D["X = GET counter:delayed:discord:{discordServerId}"]
    D --> E["readyTimestamp = nextRequestTimestamp + <br>Math.floor(REQUESTS_WAITING/REQUESTS_PER_WINDOW)*TIME_WINDOW"]
    E --> F["INCR counter:delayed:discord:{discordServerId}"]
    F --> G["put job to DELAYED queue with the readyTimestamp"]
    I --> J["End"]
    G --> J
```
