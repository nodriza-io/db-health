const express = require('express');
const mongoose = require('mongoose');

const app = express();
const port = 3000;
const user = process.env.MONGO_USER;
const password = process.env.MONGO_PASSWORD;
const auth = (user && password) ? `${user}:${password}@` : '';
const uri = `mongodb://${auth}localhost:27017/admin?authSource=admin&retryWrites=true&w=majority`;
const opt = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

async function connect() {
  try {
    const conn = await mongoose.connect(uri, opt);
    console.log('Connected to MongoDB'); // This line will be printed after successful connection
  } catch (err) {
    throw new Error(err.message);
  }
}

connect().then(() => {
  app.get('/', async (req, res) => {
    res.status(500).send('ok');
  })

  app.get('/ping', async (req, res) => {
    console.log('test');
    try {
      const results = await mongoose.connection.db.admin().ping();
      res.status(200).send('pong');
    } catch (error) {
      console.error('Healthcheck failed', error);
      res.status(500).send(JSON.stringify(error, null, 2));
    }
  });

  app.get('/server-stats', async (req, res) => {
    try {
      const client = mongoose.connection.getClient();
      const adminDb = client.db('admin');
  
      // Get list of all databases
      const dbs = await adminDb.admin().listDatabases();
  
      let report = { _dbs: dbs};
  
      for (let dbObject of dbs.databases) {
        const db = client.db(dbObject.name);
        report[dbObject.name] = {};
  
        // Get list of all collections in the database
        const collections = await db.listCollections().toArray();
  
        for (let coll of collections) {
          // Get stats for each collection
          const collObj = db.collection(coll.name);
          const stats = await collObj.stats();
          report[dbObject.name][coll.name] = stats.count; // number of documents in the collection
        }
      }
  
      res.status(200).json(report);
    } catch (error) {
      console.error('Failed to generate report', error);
      res.status(500).json({ status: 'fail' });
    }
  });

  app.listen(port, () => {
    console.log(`Service listening at http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});
