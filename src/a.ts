import { createClient } from "redis";

const redis = createClient({ url: "redis://127.0.0.1:6379/2" });

const obj = {
  asd: "qwe",
  haha: "hehe",
  lksjdf: 123,
};

(async () => {
  await redis.connect();
  await redis.hSet("kulcs", obj);
})();
