import app from "./src/app.js";
import connectDB from "./src/config/database.js";

connectDB();

const PORT = 3044;

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}/`);
});
