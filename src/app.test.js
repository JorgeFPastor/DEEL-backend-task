const supertest = require('supertest')
const app = require('./app')
const server = require('./server')

const request = supertest(app)


test('get contract by id', done => {
    request
        .get('/contracts/1')
        .set('profile_id', 1)
        .expect(200)
        .end(e => {
            if (e) return done(e)
            return done()
        })
})

test('prevent getting a contract that does not belong to user', done => {
    request
        .get('/contracts/1')
        .set('profile_id', 3)
        .expect(404)
        .end(e => {
            if (e) return done(e)
            return done()
        })
})

test('get all contracts belonging to a client', done => {
    request
        .get('/contracts')
        .set('profile_id', 4)
        .expect(200)
        .end((e, reply) => {
            if (e) return done(e)
            try {
                expect(reply.body.length).toBe(3)
                done()
            } catch (e) {
                done(e)
            }
        })
})

test('get all contracts belonging to a contractor', done => {
    request
        .get('/contracts')
        .set('profile_id', 8)
        .expect(200)
        .end((e, reply) => {
            if (e) return done(e)
            try {
                expect(reply.body.length).toBe(2)
                done()
            } catch (e) {
                done(e)
            }
        })
})

test('get all unpaid jobs for a client', done => {
    request
        .get('/jobs/unpaid')
        .set('profile_id', 1)
        .expect(200)
        .end((e, reply) => {
            if (e) return done(e)
            try {
                expect(reply.body.length).toBe(1)
                done()
            } catch (e) {
                done(e)
            }
        })
})

test('get all unpaid jobs for a contractor', done => {
    request
        .get('/jobs/unpaid')
        .set('profile_id', 7)
        .expect(200)
        .end((e, reply) => {
            if (e) return done(e)
            try {
                expect(reply.body.length).toBe(2)
                done()
            } catch (e) {
                done(e)
            }
        })
})

test('respond with 404 when no unpaid jobs found for a client', done => {
    request
        .get('/jobs/unpaid')
        .set('profile_id', 3)
        .expect(404)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

test('respond with 404 when no unpaid jobs found for a contractor', done => {
    request
        .get('/jobs/unpaid')
        .set('profile_id', 8)
        .expect(404)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

test('pay for a job', done => {
    request
        .post('/jobs/1/pay')
        .set('profile_id', 1)
        .expect(200)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

test('reject a payment attempt if the client does not have enough balance to make it', done => {
    request
        .post('/jobs/5/pay')
        .set('profile_id', 4)
        .expect(402)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

test('prevent a paid job to be paid again', done => {
    request
        .post('/jobs/1/pay')
        .set('profile_id', 1)
        .expect(412)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

test('deposit money in the client balance', done => {
    request
        .post('/balances/deposit/2')
        .send({ deposit: 100 })
        .expect(200)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

test('prevents deposit larger than 25% of the total jobs pending to be paid', done => {
    request
        .post('/balances/deposit/2')
        .send({ deposit: 1000 })
        .expect(406)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

test('calculate the best profession based on earnings within a date range', done => {
    request
        .get('/admin/best-profession?start=2020-01-01&end=2020-12-31')
        .expect(200)
        .end((e, reply) => {
            if (e) return done(e)
            try {
                expect(reply.res.text).toBe('Programmer')
                done()
            } catch (e) {
                console.error(e)
            }
        })
})

test('calculate the best profession based on earnings within a different date range', done => {
    request
        .get('/admin/best-profession?start=2020-01-01&end=2020-08-10')
        .expect(200)
        .end((e, reply) => {
            if (e) return done(e)
            try {
                expect(reply.res.text).toBe('Musician')
                done()
            } catch (e) {
                console.error(e)
            }
        })
})

test('responds with 404 when trying to calculate best profession within a date range that has no payments', done => {
    request
        .get('/admin/best-profession?start=2020-01-01&end=2020-01-31')
        .expect(404)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

test('get best two clients based on payments done within a date range', done => {
    request
        .get('/admin/best-clients?start=2020-01-01&end=2020-12-31')
        .expect(200)
        .end((e, reply) => {
            if (e) return done(e)
            try {
                expect(reply.body.length).toBe(2)
                done()
            } catch (e) {
                done(e)
            }
        })
})

test ('get best client based on payments done within a date range', done => {
    request
        .get('/admin/best-clients?start=2020-01-01&end=2020-12-31&limit=1')
        .expect(200)
        .end((e, reply) => {
            if (e) return done(e)
            try {
                expect(reply.body.length).toBe(1)
                expect(reply.body[0].firstName).toBe('Ash')
                done()
            } catch (e) {
                done(e)
            }
        })
})

test ('responds with 404 when trying to get best clients within a date range that has no payments', done => {
    request
        .get('/admin/best-clients?start=2020-01-01&end=2020-01-31')
        .expect(404)
        .end(e => {
            if (e) return done(e)
            done()
        })
})

afterAll(() => {
    server.close()
})
