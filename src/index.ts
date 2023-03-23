import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import express from "express";
import { setPersistence, setupWSConnection } from "./server/utils.js";
import logger from "./utils/logger.js";
import { MongodbPersistence } from "y-mongodb";
import * as Y from "yjs";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { getQueryParams, onSocketError } from "./utils/utils.js";

dotenv.config();

// Server params
const host = process.env.HOST || "localhost";
const port = process.env.PORT || 4321;
// Backend params
const authHost = process.env.AUTHHOST || "http://127.0.0.1:3004/api/docs/";
const authPath = "/assertReadWrite";
// DB params
const dbHost = process.env.DBHOST || "mongodb://localhost:27019/colablexical";
const dbcollection = process.env.DBCOLLECTION || "documents";
const mdb = new MongodbPersistence(dbHost, dbcollection);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

setPersistence({
  provider: mdb,
  bindState: async (docName, ydoc) => {
    const persistedYdoc = await mdb.getYDoc(docName);
    if (!persistedYdoc) logger.debug(`No persisted doc found for ${docName}`);
    const newUpdates = Y.encodeStateAsUpdate(ydoc);
    mdb.storeUpdate(docName, newUpdates);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    ydoc.on("update", async (update) => {
      mdb.storeUpdate(docName, update);
      logger.debug(`PERSISTENCE: ${docName}`);
    });
  },
  writeState: async (docName, ydoc) => {},
});

server.on("upgrade", (request, socket, head) => {
  const handleAuth = async (ws: WebSocket) => {
    let isAuthorised;

    const queryParams = getQueryParams(request.url!);
    const docId = queryParams.docId;
    const cookie = request.headers.cookie;

    if (cookie == undefined) {
      logger.error("[auth]: Cookie undefined");
      isAuthorised = false;
    } else if (docId === undefined) {
      logger.error("[auth]: docId undefined");
      isAuthorised = false;
    } else {
      logger.debug(
        `[auth]: GET http://127.0.0.1:3004/api/docs/${docId}/assertReadWrite`
      );
      const authRes = await fetch(
        `http://127.0.0.1:3004/api/docs/${docId}/assertReadWrite`,
        {
          method: "GET",
          headers: {
            Cookie: cookie,
          },
        }
      );
      authRes.status > 400 ? (isAuthorised = false) : (isAuthorised = true);
    }

    if (!isAuthorised) {
      ws.close(1008, "Unauthorised");
      logger.error("[auth]: Authorisation denied");
    }

    logger.debug("[auth]: Authorisation approved");
    logger.debug(`Current connections: ${wss.clients.size}`);
    wss.emit("connection", ws, request);
    logger.debug(`CONNOPENED: ${request.url}`);
  };
  wss.handleUpgrade(request, socket, head, handleAuth);
});

wss.on("connection", setupWSConnection);
wss.on("error", onSocketError);

server.listen(port, () => {
  logger.info(`Websocks running at '${host}' on port ${port}`);
});
