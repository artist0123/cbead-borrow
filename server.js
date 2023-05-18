require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const AWS = require("aws-sdk");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "us-east-1",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const tableName = "borrow";

app.post("/borrow", async (req, res) => {
  const model = req.body;

  const params = {
    TableName: tableName, // Replace with your actual DynamoDB table name
    Item: {
      id: uuidv4(),
      status: model.status,
      borrow_date: model.borrow_date,
      due_date: model.due_date,
      late: model.late,
      userId: model.userId,
      booksId: model.booksId,
    },
  };

  try {
    await dynamodb.put(params).promise();
    res.json({ message: "Borrow created successfully", id: params.Item.id });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.put("/borrow", async (req, res) => {
  const model = req.body;

  const params = {
    TableName: tableName, // Replace with your actual DynamoDB table name
    Key: {
      id: model.id,
    },
    UpdateExpression:
      "set #status = :s, borrow_date = :bd, due_date = :dd, late = :l, userId = :uid, booksId = :bid",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":s": model.status,
      ":bd": model.borrow_date,
      ":dd": model.due_date,
      ":l": model.late,
      ":uid": model.userId,
      ":bid": model.booksId,
    },
  };

  try {
    await dynamodb.update(params).promise();
    res.json({ message: "Borrow updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// ... (previous code)

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
