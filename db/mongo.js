import { MongoClient } from 'mongodb';

let client;
let database;

export async function connectToDatabase() {
	if (database) {
		return database;
	}

	const uri = process.env.MONGO_URI;
	if (!uri) {
		throw new Error('MONGO_URI is not set. Add the MongoDB connection string to .env.');
	}

	const nextClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
	try {
		await nextClient.connect();
		database = nextClient.db();
		client = nextClient;
		console.log(`Connected to MongoDB database: ${database.databaseName}`);
		return database;
	} catch (error) {
		await nextClient.close();
		throw error;
	}
}

export async function closeDatabase() {
	if (client) {
		await client.close();
		client = undefined;
		database = undefined;
	}
}