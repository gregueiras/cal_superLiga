const rp = require('request-promise')
const calendarName = 'Jogos GM'
const $ = require('cheerio')
const fs = require('fs')
const readline = require('readline')
const { google } = require('googleapis')
require('datejs')
const url =
  'https://www.minifootball.pt/calend%C3%A1rio/1a-ep-2018-2019-elite-porto-futsal/'

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

const getGames = auth =>
  rp(url)
    .then(html => {
      //success!
      let games = parseGames(html)
      getGamesCalendar(auth, addGames, games)
    })
    .catch(err => {
      //handle error
      console.log(err)
    })

const parseGame = (team1, team2, date, result) => {
  const res1 = result[1].children[0].data.trim()
  const res2 = result[5].children[0].data.trim()
  const resultString = res1 === '' ? '' : `${res1} - ${res2}`

  return {
    home: team1.children[0].data,
    away: team2.children[0].data,
    date: date.attribs.content,
    description: resultString
  }
}

function parseGames(html) {
  const allGames = $('h5.widget-game-result__team-name', html)
  const allDates = $('time.widget-game-result__date', html)
  const allResults = $('a.widget-game-result__score', html)
  let games = []
  for (let index = 0; index < allDates.length; index++) {
    const team1 = allGames[index * 2]
    const team2 = allGames[index * 2 + 1]
    const date = allDates[index]
    const result = allResults[index].childNodes
    const game = parseGame(team1, team2, date, result)
    games.push(game)
  }
  return games
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
    scope: SCOPES
  })
  console.log('Authorize this app by visiting this url:', authUrl)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  rl.question('Enter the code from that page here: ', code => {
    rl.close()
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err)
      oAuth2Client.setCredentials(token)
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
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
  const { client_secret, client_id, redirect_uris } = credentials.installed
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  )

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback)
    oAuth2Client.setCredentials(JSON.parse(token))
    callback(oAuth2Client)
  })
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getGamesCalendar(auth, callback, games) {
  const calendar = google.calendar({ version: 'v3', auth })
  calendar.calendarList.list({}, (err, result) => {
    if (result) {
      const cal = result.data.items.find(cal => cal.summary.match(calendarName))
      callback(games, cal.id, calendar)
    } else {
      console.log(err)
    }
  })
}

function addGames(games, id, calendar) {
  const newEvents = createEvents(games)

  getEvents(id, calendar)
    .then(events => {
      newEvents.forEach(event => {
        const existingEvent = events.filter(ev => {
          const sameDates = compareDates(event, ev)
          return sameDates && ev.summary === event.summary
        })[0]
        if (existingEvent) {
          processEvent(calendar, id, event, 'patch', existingEvent)
        } else {
          processEvent(calendar, id, event, 'insert')
        }
      })
    })
    .catch(error => {
      console.log(error)
    })
}

function processEvent(calendar, calendarId, event, option, existingEvent) {
  if (option === 'insert') {
    calendar.events.insert(
      {
        calendarId: calendarId,
        resource: event
      },
      err => {
        if (err) {
          console.log(
            'There was an error contacting the Calendar service: ' + err
          )
          return
        }
        console.log('Event created: %s', event.summary)
      }
    )
  } else if (option === 'patch') {
    const sameDates = compareDates(existingEvent, event)
    const sameDescription = compareDescription(existingEvent, event)

    if (sameDates && !sameDescription) {
      calendar.events.patch(
        {
          calendarId: calendarId,
          eventId: existingEvent.id,
          resource: event
        },
        err => {
          if (err) {
            console.log(
              'There was an error contacting the Calendar service: ' + err
            )
            return
          }
          console.log(
            'Event updated: %s - %s',
            event.summary,
            event.description
          )
        }
      )
    } else {
      console.log('No changes to the event')
    }
  }
}

function compareDates(eventA, eventB) {
  const startA = Date.parse(eventA.start.dateTime)
  const startALower = startA.add(-1).month()
  const startAUpper = startA.add(+1).month()
  const startB = Date.parse(eventB.start.dateTime)

  const endA = Date.parse(eventA.end.dateTime)
  const endALower = endA.add(-1).month()
  const endAUpper = endA.add(+1).month()
  const endB = Date.parse(eventB.end.dateTime)

  return (
    startB.between(startALower, startAUpper) &&
    endB.between(endALower, endAUpper)
  )
}

function compareDescription(event, game) {
  const eventDescription = event.description
  const gameDescription = game.description

  return (!gameDescription) || gameDescription === eventDescription
}

function getEvents(id, calendar) {
  return new Promise((resolve, reject) => {
    calendar.events.list(
      {
        calendarId: id,
        showDeleted: false,
        singleEvents: true,
        orderBy: 'startTime'
      },
      (err, events) => {
        if (err) {
          reject(events)
        } else {
          resolve(events.data.items)
        }
      }
    )
  })
}

function createEvents(games) {
  let events = []
  games.forEach(game => {
    events.push(createEvent(game))
  })

  return events
}

function createEvent(game) {
  return {
    summary: `${game.home} - ${game.away}`,
    location: 'CDUP, CDUP, Porto',
    start: {
      dateTime: `${new Date(game.date).toString('yyyy-MM-ddTHH:mm:ss-00:00')}`,
      timeZone: 'Europe/Lisbon'
    },
    end: {
      dateTime: `${new Date(game.date)
        .addMinutes(70)
        .toString('yyyy-MM-ddTHH:mm:ss-00:00')}`,
      timeZone: 'Europe/Lisbon'
    },
    description: game.description
  }
}
