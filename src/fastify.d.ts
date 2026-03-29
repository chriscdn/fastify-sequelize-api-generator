import "fastify";
import type { Model } from "sequelize";

declare module "fastify" {
  interface FastifyRequest {
    instance?: Model;
    instances?: Model[];
  }
}
