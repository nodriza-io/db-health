const express = require('express');
const mongoose = require('mongoose');
const { exec } = require('child_process');

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

function authorized(req, res) {
  const token = req.query.token;
  if (token !== 'Shox009_') {
    res.status(401).send('401 - Unauthorized');
    return false
  } else {
    return true;
  }
}

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
    // Check DB
    try {
      const results = await mongoose.connection.db.admin().ping();
    } catch (error) {
      console.error('Healthcheck failed', error);
      return res.status(500).send(`${process.env.HOSTNAME} DB Fail: ${JSON.stringify(error, null, 2)}`);
    }
    // Check HD
    exec('df -h', (error, stdout, stderr) => {
      if (error) {
        console.error('Error executing disk space check:', error);
        return res.status(500).send(JSON.stringify(error, null, 2));
      }
      const lines = stdout.trim().split('\n');
      // Skip the header line
      const dataLines = lines.slice(1);
      
      const disks = dataLines.map(line => {
        const [filesystem, size, used, avail, usePercent, mounted] = line.split(/\s+/);
        return { filesystem, size, used, avail, usePercent, mounted };
      });
  
      const targetDisk = disks.find(disk => disk.filesystem === '/dev/nvme0n1p1');
  
      if (!targetDisk) {
        return res.status(500).json({ error: 'Target disk /dev/nvme0n1p1 not found.' });
      }
  
      // If disk space is less than 10%, send an error
      if (parseInt(targetDisk.usePercent, 10) > 90) {
        return res.status(500).json({ 
          error: `${process.env.HOSTNAME} HD is running out of space. ${targetDisk.filesystem} has ${targetDisk.size}, is using ${targetDisk.used}, and only has ${targetDisk.usePercent} left.`
        });
      }
      // res.status(200).json({ message: 'Disk space check passed.', disk: targetDisk });
      res.status(200).send('pong');
    });
  });
  

  // http://dev4.nodriza.io:3000/db?token=Shox009_

  app.get('/db', async (req, res) => {
    if (!authorized(req, res)) return;
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
    const hostname = process.env.HOSTNAME ? `${process.env.HOSTNAME}-public.skemify.co` : 'localhost';
    console.log(`Service listening at http://${hostname}:${port}`);
  });

}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
});