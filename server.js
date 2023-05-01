require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const AWS = require("aws-sdk");
const { processPayment, savePaymentRecord } = require("./paymentService");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const tableName = "borrow";

// Define your API routes here
// ... (previous code)

// List all borrowings
app.get("/borrow", (req, res) => {
  const params = {
    TableName: tableName,
  };

  dynamoDb.scan(params, (error, data) => {
    if (error) {
      res.status(500).json({ error: "Error fetching borrowings" });
    } else {
      res.json(data.Items);
    }
  });
});

// Get a single borrowing by ID
app.get("/borrow/:borrowId", (req, res) => {
  const params = {
    TableName: tableName,
    Key: {
      borrowId: req.params.borrowId,
    },
  };

  dynamoDb.get(params, (error, data) => {
    if (error) {
      res.status(500).json({ error: "Error fetching borrowing" });
    } else {
      res.json(data.Item);
    }
  });
});

// Borrow multiple books
app.post("/books/borrow", async (req, res) => {
  const { userId, bookIds, borrowDate, dueDate } = req.body;

  if (!Array.isArray(bookIds) || bookIds.length === 0) {
    res.status(400).json({ error: "bookIds must be a non-empty array" });
    return;
  }

  try {
    const borrowedBooks = [];
    for (const bookId of bookIds) {
      // Generate a unique borrowId
      const borrowId = uuidv4();

      // Add a new borrow record for the book
      const borrowRecord = {
        borrowId,
        userId,
        bookId,
        borrowDate,
        dueDate,
        returnDate: null,
        lateFine: 0,
      };

      const borrowRecordParams = {
        TableName: tableName,
        Item: borrowRecord,
      };

      await dynamoDb.put(borrowRecordParams).promise();

      const bookParams = {
        TableName: "books",
        Key: { id: bookId },
        UpdateExpression: "SET available = :available",
        ExpressionAttributeValues: { ":available": false },
        ReturnValues: "ALL_NEW",
      };

      const data = await dynamoDb.update(bookParams).promise();
      borrowedBooks.push({
        ...data.Attributes,
        borrowId,
        userId,
        borrowDate,
        dueDate,
      });
    }

    res.json(borrowedBooks);
  } catch (error) {
    res.status(500).json({ error: "Error borrowing books" });
  }
});

// Return multiple borrowed books
app.post("/books/return", async (req, res) => {
  const { userId, bookIds, returnDate, paymentInfo } = req.body;

  if (!Array.isArray(bookIds) || bookIds.length === 0) {
    res.status(400).json({ error: "bookIds must be a non-empty array" });
    return;
  }

  try {
    const returnedBooks = [];
    let totalLateFine = 0;

    for (const bookId of bookIds) {
      // Retrieve the due date from the borrow record
      const borrowRecordParams = {
        TableName: tableName,
        Key: { userId, bookId },
      };

      const borrowRecordData = await dynamoDb.get(borrowRecordParams).promise();
      const dueDate = new Date(borrowRecordData.Item.dueDate);

      const actualReturnDate = new Date(returnDate);
      const lateDays = Math.ceil(
        (actualReturnDate - dueDate) / (1000 * 60 * 60 * 24)
      );
      const lateFine = lateDays > 0 ? lateDays * /* Fine rate per day */ 20 : 0;
      totalLateFine += lateFine;

      const bookParams = {
        TableName: "books",
        Key: { id: bookId },
        UpdateExpression: "SET available = :available",
        ExpressionAttributeValues: { ":available": true },
        ReturnValues: "ALL_NEW",
      };

      const data = await dynamoDb.update(bookParams).promise();
      returnedBooks.push({ ...data.Attributes, userId, returnDate, lateFine });

      // Update the borrow record with the return date and the late fine (if any) for each book
      const updateBorrowRecordParams = {
        TableName: "BorrowRecords",
        Key: { userId, bookId },
        UpdateExpression: "SET returnDate = :returnDate, lateFine = :lateFine",
        ExpressionAttributeValues: {
          ":returnDate": returnDate,
          ":lateFine": lateFine,
        },
        ReturnValues: "ALL_NEW",
      };

      await dynamoDb.update(updateBorrowRecordParams).promise();
    }

    if (totalLateFine > 0) {
      const paymentSuccess = processPayment(totalLateFine, paymentInfo);

      const paymentRecord = await savePaymentRecord(
        totalLateFine,
        userId,
        null,
        null,
        totalLateFine,
        paymentSuccess ? "success" : "failed"
      );

      if (!paymentSuccess) {
        res.status(400).json({ error: "Payment failed", paymentRecord });
        return;
      }
    }

    res.json(returnedBooks);
  } catch (error) {
    res.status(500).json({ error: "Error returning books" });
  }
});

// Delete a borrowing
app.delete("/borrow/:borrowId", (req, res) => {
  const params = {
    TableName: tableName,
    Key: {
      borrowId: req.params.borrowId,
    },
  };

  dynamoDb.delete(params, (error) => {
    if (error) {
      res.status(500).json({ error: "Error deleting borrowing" });
    } else {
      res.json({ success: true });
    }
  });
});

// ... (previous code)

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
});
