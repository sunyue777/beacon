import { LocalJsonRepo } from "./local-json-repo";
import { RemoteApiRepo } from "./remote-api-repo";
import type { Repo } from "./repo";

let repo: Repo | undefined;

export function getRepo(): Repo {
  if (repo) {
    return repo;
  }

  const remoteBaseUrl = process.env.INSTITUTION_API_BASE_URL;
  repo = remoteBaseUrl ? new RemoteApiRepo(remoteBaseUrl) : new LocalJsonRepo();
  return repo;
}

export type { Repo } from "./repo";
