const rp = require('request-promise')
const url = 'https://www.minifootball.pt/calend%C3%A1rio/1a-ep-2018-2019-elite-porto-futsal/'
const calendarName = 'Jogos GM'
const $ = require('cheerio')
const fs = require('fs')
const readline = require('readline')
const {google} = require('googleapis')
require('datejs')


const getGames = (auth) => rp(url)
  .then(html => {
    //success!
    const allGames = $('h5.widget-game-result__team-name', html)
    const allDates = $('time.widget-game-result__date', html)

    let games = []
    const upperLimit = Date.parse('t + 3d')
    const lowerLimit = Date.parse('t - 1d')
  
    for (let index = 0; index < allDates.length; index++) {
      const team1 = allGames[index * 2]
      const team2 = allGames[index * 2 + 1]
      const date = allDates[index]
      
      const game = parseGame(team1, team2, date)
      
      const parsedDate = Date.parse(game.date)
      if (parsedDate.between(lowerLimit, upperLimit)) {
        games.push(game)
      }      
    }
    
    getGamesCalendar(auth, addGames, games)
  })
  .catch(err => {
    //handle error
    console.log(err)
  })

const parseGame = (team1, team2, date) => {
  return {
    home: team1.children[0].data,
    away: team2.children[0].data,
    date: date.attribs.content
  }
} 

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  }) 
  console.log('Authorize this app by visiting this url:', authUrl) 
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close() 
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err) 
      oAuth2Client.setCredentials(token) 
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err) 
        console.log('Token stored to', TOKEN_PATH) 
      }) 
      callback(oAuth2Client) 
    }) 
  }) 
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed 
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]) 

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback) 
    oAuth2Client.setCredentials(JSON.parse(token)) 
    callback(oAuth2Client) 
  }) 
}


// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'] 
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json' 


// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err) 
  // Authorize a client with credentials, then call the Google Calendar API.
  authorize(JSON.parse(content), getGames) 
}) 


/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getGamesCalendar(auth, callback, games) {
  const calendar = google.calendar({version: 'v3', auth})
  calendar.calendarList.list(
    {},
    (err, result) => {
      if (result) {
        const cal = result.data.items.find(cal => cal.summary.match(calendarName))
        callback(games, cal.id, calendar)
      } else {
        console.log(err)
      }
    })

}

function addGames(games, id, calendar) {
  const events = createEvents(games)
  
  events.forEach(event => {
    calendar.events.insert({
      calendarId: id,
      resource: event
    }, (err, eventA) => {
      if (err) {
        console.log('There was an error contacting the Calendar service: ' + err)
        return
      }
      console.log('Event created: %s', event.summary)
    })
  })
}

function createEvents(games) {
  let events = []
  games.forEach(game => {
    let gameDate = new Date(game.date)
    if (gameDate > new Date()) {
      events.push({
        'summary': `${game.home} - ${game.away}`,
        'location': 'CDUP, CDUP, Porto',
        'start': {
          'dateTime': `${new Date(game.date).toString('yyyy-MM-ddTHH:mm:ss-00:00')}`,
          'timeZone': 'Europe/Lisbon',
        },
        'end': {
          'dateTime': `${new Date(game.date).addMinutes(70).toString('yyyy-MM-ddTHH:mm:ss-00:00')}`,
          'timeZone': 'Europe/Lisbon',
        }
      })
    }
  })

  return events
}