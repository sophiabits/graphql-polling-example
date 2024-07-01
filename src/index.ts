import {
  graphql,
  GraphQLBoolean,
  GraphQLID,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";
import * as ResourceId from "resource-id";
import { setTimeout } from "timers/promises";

const JOB_DURATION_MS = 5_000;

interface JobType {
  startedAt: Date;
}

const jobsStore = new Map<string, JobType>();

const Job = new GraphQLObjectType({
  name: "Job",
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    done: {
      type: new GraphQLNonNull(GraphQLBoolean),
    },
    query: {
      type: Query,
    },

    // TODO: Add extra fields here, e.g. `createdAt`, `eta`, ...
  }),
});

function resolveJob(job: JobType) {
  const willFinishAt = job.startedAt.getTime() + JOB_DURATION_MS;
  const done = willFinishAt < Date.now();

  return {
    done,
    query: done ? {} : null,
  };
}

const Mutation = new GraphQLObjectType({
  name: "Mutation",
  fields: {
    summaryCreate: {
      type: new GraphQLNonNull(Job),
      resolve: () => {
        const jobId = ResourceId.generate("job");

        // TODO: Kick off an actual asynchronous operation here
        const startedAt = new Date();
        const job: JobType = { startedAt };
        jobsStore.set(jobId, job);

        return {
          id: jobId,
          ...resolveJob(job),
        };
      },
    },
  },
});

const Query = new GraphQLObjectType({
  name: "Query",
  fields: {
    greeting: {
      args: {
        subject: {
          type: new GraphQLNonNull(GraphQLString),
        },
      },
      type: new GraphQLNonNull(GraphQLString),
      // Because we don't use the `source` argument, our empty object returned
      // on `Job.query` will resolve correctly. If you _did_ need something on
      // the source type, you'd need to return that inside the object resolved from
      // `Job.query`
      resolve: (_source, { subject }) => `Hello, ${subject}`,
    },
    job: {
      args: {
        id: {
          type: new GraphQLNonNull(GraphQLID),
        },
      },
      type: Job,
      resolve: (_source, { id }) => {
        const job = jobsStore.get(id);
        if (!job) {
          throw new Error(`No such job: ${id}`);
        }

        return {
          id,
          ...resolveJob(job),
        };
      },
    },
  },
});

const schema = new GraphQLSchema({
  query: Query,
  mutation: Mutation,
});

async function main() {
  let jobId: string;

  console.group("Creating job");
  {
    const result = await graphql({
      schema,
      source: `
        mutation {
          summaryCreate {
            id
          }
        }
      `,
    });
    jobId = (result.data!.summaryCreate as any)!.id;
    console.log(`Created job: ${jobId}`);
  }
  console.groupEnd();
  console.log();

  console.group("Querying job (not yet complete)");
  {
    const result = await graphql({
      schema,
      source: `
        query ($id: ID!) {
          job(id: $id) {
            done
            query {
              greeting(subject: "world")
            }
          }
        }
      `,
      variableValues: { id: jobId },
    });

    console.log("Query result:");
    console.log(JSON.stringify(result.data, null, 2));
  }
  console.groupEnd();

  console.log();
  console.log(`Sleeping until job is complete (${JOB_DURATION_MS / 1_000}s)`);
  await setTimeout(JOB_DURATION_MS);

  console.log();
  console.group("Querying job (completed)");
  {
    const result = await graphql({
      schema,
      source: `
      query ($id: ID!) {
        job(id: $id) {
          done
          query {
            greeting(subject: "world")
          }
        }
      }
    `,
      variableValues: { id: jobId },
    });

    console.log("Query result:");
    console.log(JSON.stringify(result.data, null, 2));
  }
  console.groupEnd();
}

main();
