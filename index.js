const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
const jwt = require("jsonwebtoken");
const cors = require('cors')
require('dotenv').config();

const config = {
  connectionString: process.env.DB
};

const { Client } = require('pg');
const { constants } = require("buffer");
const { parse } = require("path");
const { stringify } = require("querystring");
const { error } = require("console");
const client = new Client(config);
client.connect();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let currency = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  minimumIntegerDigits: 1,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function GenerateJWT(_userId, _username, _merchant)
{
  return jwt.sign(
      { userId: _userId, username: _username, merchant: _merchant},
      process.env.TOKEN_KEY,
      { expiresIn: "1h" }
    );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  const response = {
    status : false,
    data: {},
    message: "Session Expired"
  };
  
  if (authHeader)
  {
    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.TOKEN_KEY, async (err, user) =>
    {
      if (err)
      {
        return res.status(200).json(response);
      }

      let result = await client.query("SELECT * FROM users WHERE token = $1", [token])
      if(result.rows.length <= 0)
      { 
        return res.status(200).json(response);
      }

      req.user = user;
      next();
    });
  }
  else
  {
    return res.status(200).json(response);
  }
}

app.get('/', (req, res) => {
  return res.status(200).json("OK");
});

app.post('/login', async (req, res) => {

  if( typeof(req.body.username) == 'undefined' || typeof(req.body.password) == 'undefined')
  {
    return res.status(200).json(
    {
      status: false,
      data: {},
      message: "Error: Please enter your username and password to login.",
    });
  }

  client.query("SELECT * FROM users WHERE username = $1 AND password = crypt($2, password)", [req.body.username, req.body.password])
  .then((result) => {
    if(result.rows.length > 0)
    {
      const token = GenerateJWT(result.rows[0].id, result.rows[0].username, result.rows[0].role);

      client.query("UPDATE users SET last_login = NOW() WHERE id = $1", [result.rows[0].id])

      res.status(200).json({
        success: true,
        data: {
          userId: result.rows[0].id,
          token: token,
        },
        message: ""
      });
    }
    else
    {
      return res.status(200).json(
      {
        status: false,
        data: {},
        message: "Error: Wrong Username or Password",
      });
    }
  })
  .catch((e) => {
    console.error(e.stack);
    res.status(500).send(e.stack);
  })
})

app.post('/register', async (req, res) => {
  if (typeof req.body.username === 'undefined' || typeof req.body.password === 'undefined') {
    return res.status(200).json({
      status: false,
      data: {},
      message: "Error: Please provide a username and password to register.",
    });
  }

  try {
    const existingUser = await client.query("SELECT * FROM users WHERE username = $1", [req.body.username]);
    if (existingUser.rows.length > 0) {
      return res.status(200).json({
        status: false,
        data: {},
        message: "Error: Username is already taken.",
      });
    }

    await client.query(
      "INSERT INTO users (username, password) VALUES ($1, crypt($2, gen_salt('bf')))",
      [req.body.username, req.body.password]
    );

    res.status(200).json({
      success: true,
      data: {},
      message: "Registration successful.",
    });
  } catch (e) {
    console.error(e.stack);
    res.status(500).send(e.stack);
  }
});

app.post('/getUser', verifyToken, (req, res) => {
  client.query("SELECT * FROM users WHERE user_id = $1", [req.user.userId])
  .then(async (result) => {
    if(result.rows.length > 0)
    {
      return res.status(200).json({
        status: true,
        data: result.rows[0],
        message: "Success"
      }); 
    }
    else
    {
      return res.status(200).json({
        status: false,
        data: {},
        message: "ID not found"
      }); 
    }
  })
});

const spinWheel = () => {
  const redNumbers = [1, 3, 5, 8, 10, 12];
  const blackNumbers = [2, 4, 6, 7, 9, 11];

  const number = Math.floor(Math.random() * 12) + 1;
  const color = redNumbers.includes(number) ? 'red' : 'black';
  const oddEven = (number % 2 === 0) ? 'even' : 'odd';
  const numSize = number <= 6 ? 'small' : 'big';

  const result = {
    number: number.toString(),
    color: color,
    oddEven: oddEven,
    numSize: numSize
  }
  return result;
};

app.post('/mini-roulette/play', verifyToken, async (req, res) => {
  let currencyType = req.body.currencyType;
  let bets = req.body.bets;

  let totalBet = 0;
  let totalWin = 0;
  let totalWinlose = 0;

  for (let key in bets) {
    if (bets.hasOwnProperty(key)) {
      totalBet += bets[key];
    }
  }

  let selectedWallet = await client.query(`SELECT * FROM wallets WHERE owner_id = $1 AND wallet_type = $2`, [req.user.userId, currencyType]);
  if(selectedWallet.rows[0].balance < Number(totalBet))
  {
    let response = {
      status: false,
      data: {},
      message: "Insufficient Credit"
    }
  
    return res.status(200).json(response);
  }

  let luck = Math.floor(Math.random() * 101);
  let spinResult;
  
  do
  {
    spinResult = await spinWheel();

    if (bets.hasOwnProperty(spinResult.number)) {
      totalWin += bets[spinResult.number] * 10.5;
    }
  
    if(bets.hasOwnProperty(spinResult.color))
    {
      totalWin += bets[spinResult.color] * 1.95;
    }
  
    if(bets.hasOwnProperty(spinResult.oddEven))
    {
      totalWin += bets[spinResult.oddEven] * 1.95;
    }
  
    if(bets.hasOwnProperty(spinResult.numSize))
    {
      totalWin += bets[spinResult.numSize] * 1.95;
    }
    
    totalWinlose = totalWin - totalBet;  
  } while(totalWinlose > 0 && luck < 30)
  
  let match = await client.query(
    "INSERT INTO mr_matches (user_id, currency, bet_info, result, total_win, total_win_lose, merchant) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
    [req.user.userId, currencyType, bets, spinResult, totalWin, totalWinlose  , req.user.merchant]
  );

  let wallet = await client.query(
    "UPDATE wallets SET balance = (balance + $1) WHERE wallet_type = $2 AND owner_id = $3 RETURNING *",
    [totalWinlose, currencyType, req.user.userId]
  );

  await client.query(
    "INSERT INTO transactions (wallet_id, \"from\", \"to\", amount, transaction_type, remark) VALUES ($1, $2, $3, $4, $5, $6)",
    [wallet.rows[0].id, parseFloat(wallet.rows[0].balance - totalWinlose), parseFloat(wallet.rows[0].balance), totalWinlose, "MR", "Match Id = "+match.rows[0].id]
  );

  let win = 0;
  let lose = 0;
  if(totalWinlose > 0)
    win = Math.abs(totalWinlose);
  else
    lose = Math.abs(totalWinlose);

  await client.query(
  "INSERT INTO game_summary (game_type, game_id, uid, wallet_type, bet_amount, win, lose, merchant) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    ["MR", match.rows[0].id, req.user.userId, currencyType, totalBet, win, lose, req.user.merchant]
  );
    
  let response = {
    status: true,
    data: {
      number: Number(spinResult.number),
      color: spinResult.color,
      oddEven: spinResult.oddEven,
      numSize: spinResult.numSize,
      amount: totalWin
    },
    message: "Success"
  }

  return res.status(200).json(response);
});

app.listen(port, () => {
  console.log(`Mini Roulette API running`);
});