import { createServer } from "node:http";
import app from "./src/app.js";
import connectDB from "./src/config/database.js";
import { initializeChatSocket } from "./src/socket/chatSocket.js";

connectDB();

const PORT = process.env.PORT || 3044;
const httpServer = createServer(app);

initializeChatSocket(httpServer, app);

httpServer.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/`);
});
