const express = require('express');
const mysql = require('mysql');
const app = express();
app.use(express.json());

// Configurare conexiune la baza de date
const connection = mysql.createConnection({
  host: '49.12.231.103',
  user: 'gdev',
  password: 'gdev',
  database: 'andro'
});

connection.connect((err) => {
  if (err) {
    console.error('Eroare la conectarea la baza de date:', err);
    return;
  }
  console.log('Conexiune la baza de date reușită');
});

// Definire rute
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
  
    // Verificăm dacă email-ul există deja în baza de date
    connection.query('SELECT * FROM Users WHERE email = ?', [email], (error, results, fields) => {
      if (error) {
        console.error('Eroare la verificarea existenței email-ului:', error);
        res.status(500).json({ error: 'Eroare internă' });
        return;
      }
  
      // Dacă există deja un utilizator cu acest email, returnează eroare
      if (results.length > 0) {
        res.status(400).json({ error: 'Există deja un utilizator cu acest email' });
        return;
      }
  
      // Dacă email-ul nu există în baza de date, inserăm noul utilizator
      const hashedPassword = Buffer.from(password).toString('base64');
      connection.query('INSERT INTO Users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword], (error, results, fields) => {
        if (error) {
          console.error('Eroare la inserarea utilizatorului:', error);
          res.status(500).json({ error: 'Eroare internă' });
          return;
        }
  
        // Extragem id-ul utilizatorului nou creat din rezultatul interogării de inserare
        const userId = results.insertId;
  
        // Returnăm datele utilizatorului nou creat, inclusiv id-ul
        res.json({ id: userId, username, email, authentication: true });
      });
    });
  });
  
  app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
  
    // Verificăm dacă există un utilizator cu acest email și parola corespunde
    const hashedPassword = Buffer.from(password).toString('base64');
    connection.query('SELECT * FROM Users WHERE email = ? AND password = ?', [email, hashedPassword], (error, results, fields) => {
      if (error) {
        console.error('Eroare la verificarea autentificării utilizatorului:', error);
        res.status(500).json({ error: 'Eroare internă' });
        return;
      }
  
      // Dacă nu există un utilizator cu acest email și parola corespunde, returnăm eroare
      if (results.length === 0) {
        res.status(401).json({ error: 'Email sau parolă incorecte' });
        return;
      }
  
      // Returnăm datele utilizatorului autentificat
      const user = results[0];
      res.json({ username: user.username, email: user.email, id: user.id,authentication: true });
    });
  });
  app.post('/api/searchByUsername', (req, res) => {
    const { username } = req.body;
    const searchTerm = username + '%'; // Adăugăm % pentru a căuta numele care începe cu username
    
    // Căutăm și grupăm utilizatorii după numele de utilizator
    connection.query('SELECT id, username FROM Users WHERE username LIKE ? GROUP BY username', [searchTerm], (error, results, fields) => {
      if (error) {
        console.error('Eroare la căutarea utilizatorului:', error);
        res.status(500).json({ error: 'Eroare internă' });
        return;
      }
  
      // Dacă nu există utilizatori cu acest username, returnăm o listă goală
      if (results.length === 0) {
        res.status(404).json({ error: 'Nu s-au găsit utilizatori cu acest username' });
        return;
      }
  
      // Returnăm lista de utilizatori și ID-urile lor
      const users = results.map(user => ({ username: user.username, id: user.id }));
      res.json({ users });
    });
  });
  
  app.post('/api/getMessages', (req, res) => {
    const { senderID, page = 1, param2 } = req.body;
    const messagesPerPage = 40;
    const offset = (page - 1) * messagesPerPage;
  
    let query = 'SELECT * FROM Messages WHERE senderID = ? ORDER BY created_at DESC LIMIT ?, ?';
    let params = [senderID, offset, messagesPerPage];
  
    // Verificăm dacă este specificat al doilea parametru și ajustăm interogarea corespunzător
    if (param2) {
      const nextMessagesPerPage = 50;
      const nextOffset = page * messagesPerPage; // Offset-ul pentru următoarele mesaje
      query = 'SELECT * FROM Messages WHERE senderID = ? ORDER BY created_at DESC LIMIT ?, ?';
      params = [senderID, nextOffset, nextMessagesPerPage];
    }
  
    // Executăm interogarea
    connection.query(query, params, (error, results, fields) => {
      if (error) {
        console.error('Eroare la extragerea mesajelor:', error);
        res.status(500).json({ error: 'Eroare internă' });
        return;
      }
  
      // Dacă nu există mesaje pentru senderId-ul specificat
      if (results.length === 0) {
        res.status(404).json({ error: 'Nu s-au găsit mesaje pentru acest senderId' });
        return;
      }
  
      // Returnăm mesajele găsite
      res.json({ messages: results });
    });
});

app.get('/api/messagesBySender/:senderID', (req, res) => {
    const senderID = req.params.senderID;

    // Interogare pentru a selecta receiverID-urile distincte din tabelul Messages pentru senderID-ul specificat
    const query = 'SELECT DISTINCT receiverID FROM Messages WHERE senderID = ?';
    
    connection.query(query, senderID, (error, results, fields) => {
        if (error) {
            console.error('Eroare la extragerea receiverID-urilor:', error);
            res.status(500).json({ error: 'Eroare internă' });
            return;
        }

        if (results.length === 0) {
            res.status(404).json({ error: 'Nu s-au găsit receiverID-uri pentru acest senderID' });
            return;
        }

        // Extrage receiverID-urile din rezultate
        const receiverIDs = results.map(result => result.receiverID);

        // Interogare pentru a selecta username-urile corespunzătoare fiecărui receiverID din alt tabel
        const getUsernamesQuery = 'SELECT id, username FROM Users WHERE id IN (?)';
        
        connection.query(getUsernamesQuery, [receiverIDs], (err, userResults, fields) => {
            if (err) {
                console.error('Eroare la extragerea usernamelor:', err);
                res.status(500).json({ error: 'Eroare internă' });
                return;
            }

            // Construiește un obiect JSON care să conțină receiverID-urile și username-urile corespunzătoare
            const usernames = {};
            userResults.forEach(user => {
                usernames[user.id] = user.username;
            });

            res.json({ receiverUsernames: usernames });
        });
    });
});

  
  
// Pornire server
const PORT = 3000; // Sau alt port la alegere
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serverul a pornit pe portul ${PORT}`);
  });
  
