import request from 'request'
import cheerio from 'cheerio'
import fs from 'fs'
import notifications from 'freedesktop-notifications'

let newBookJson = []
const sections_to_watch = ["NEW", "USED"]
const book_json_file = "./books.json"
const bookJson = JSON.parse(fs.readFileSync(book_json_file, 'utf8'))

const writeJson = (data) => {
	fs.writeFileSync(book_json_file, JSON.stringify(data), 'utf8')
}
let data_counter = 0
const tryWrite = () =>{
	if (++data_counter == bookJson.length)
		writeJson(newBookJson)
}
const halfDayInMiliSec = 0.5 * 24 * 60 * 60 * 1000
const today = new Date()
bookJson.forEach(book => {
	const { author, title, isbn, prices } = book
	const mostRecentNEWPriceCheck = prices["NEW"].map(x => Date.parse(x.date))
	if (today - halfDayInMiliSec < Math.max(mostRecentNEWPriceCheck))
	{
		console.log("Sorry, you're checking too often:", title)
		newBookJson.push(book)
		return tryWrite()
	}

	let url = `https://www.bookfinder.com/search/?keywords=${isbn}&lang=&st=sh&ac=qr&submit=`
	request(url, (err, response, body) => {
		if (!err)
		{
			const $ = cheerio.load(body)
			const newAuthor = $('[itemprop="author"]').text()
			const newTitle = $('[itemprop="name"]').text()
			if (newAuthor !== author)
				console.log("Strange (author update):",author,newAuthor)
			if (newTitle !== title)
				console.log("Strange (title update):",title,newTitle)
			newBookJson.push({
				"isbn": isbn,
				"author": newAuthor,
				"title": newTitle,
				"prices": prices || {}
			})
			const current_index = newBookJson.length - 1

			const sections = $('.results-section-heading')
			const cheapRow = $('.results-section-heading + table > tbody > tr:nth-of-type(2)')
			const cheapestSeller = cheapRow.find('td:nth-of-type(2) img')
			const cheapestPrice = cheapRow.find('td:nth-of-type(4) .results-price a')
			$(sections).each(i => {
				const section = $(sections[i]).text().toUpperCase()
				const sections_to_watch_idx = sections_to_watch.find((s) => section.startsWith(s))
				if (sections_to_watch_idx) {
					const source = $(cheapestSeller[i]).prop("alt")
					const price = +$(cheapestPrice[i]).text().substring(1)
					const priceHistory = prices[sections_to_watch_idx].map(x => x.price)
					const lowestPrice = Math.min(priceHistory)
					if (price < lowestPrice || priceHistory.length === 0)
					{
						notifications.createNotification({
							summary: sections_to_watch_idx + " BOOK DEAL: " + title,
							body: `From $${lowestPrice} to ${price}`,
							icon: 'mail-unread'
						}).push()
					}

					newBookJson[current_index]["prices"][sections_to_watch_idx] = prices[sections_to_watch_idx]
					newBookJson[current_index]["prices"][sections_to_watch_idx].push({
						"price": price,
						"source": source,
						"date": new Date().toString()
					})
				}
			})
		}
		tryWrite()
	})
})