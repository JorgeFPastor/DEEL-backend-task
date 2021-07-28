const express = require('express')
const bodyParser = require('body-parser')
const {Sequelize} = require('sequelize')
const {Op} = Sequelize
const {sequelize} = require('./model')
const {getProfile} = require('./middleware/getProfile')
const app = express()
app.use(bodyParser.json())
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/*
 * @returns array of objects sorted by amount
 */
function byAmount(a, b) {
    if (a.amount === b.amount) return 0
    return a.amount < b.amount ? 1 : -1
}

/**
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) =>{
    const {Contract} = req.app.get('models')
    const {profile} = req
    const as = profile.type === 'client' ? 'ClientId' : 'ContractorId'
    const {id} = req.params
    const contract = await Contract.findOne({
        where: {
            id,
            [as]: profile.id,
        },
    })
    if(!contract) return res.status(404).end()

    res.json(contract)
})


/*
 * @returns contracts belonging to user
 */
app.get('/contracts', getProfile, async (req, res) => {
    const {Contract} = req.app.get('models')
    const {profile} = req
    const as = profile.type === 'client' ? 'ClientId' : 'ContractorId'
    const contracts = await Contract.findAll({
        where: {
            [as]: profile.id,
        }
    })
    if (!contracts.length) return res.status(404).end()

    res.json(contracts)
})

/**
 * @returns unpaid jobs belonging to user,
 * be it for a client or for a contractor
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
    const {Contract,Job} = req.app.get('models')
    const {profile} = req
    const as = profile.type === 'client' ? 'ClientId' : 'ContractorId'
    const contracts = await Contract.findAll({
        attributes: [],
        where: {
            [as]: profile.id,
            status: 'in_progress',
        },
        include: {
            model: Job,
            where: {
                paid: null,
            },
        },
    })
    if (!contracts.length) return res.status(404).end()
    const jobs = contracts.flatMap(c => c.Jobs)

    res.json(jobs)
})

/**
 * @allows a client to pay for a job done by a contractor
 */
app.post('/jobs/:id/pay', getProfile, async (req, res) => {
    const {profile} = req
    const {id} = req.params
    const {Profile,Contract,Job} = req.app.get('models')
    const contract = await Contract.findOne({
        where: {
            ClientId: profile.id,
        },
        attributes: ['ContractorId'],
        include: {
            model: Job,
            where: { id },
        },
    })
    if (!contract) return res.status(404).end()

    let {Jobs,ContractorId} = contract
    if (!Jobs.length) return res.status(404).end()

    const [job] = Jobs
    if (job.paid) return res.status(412).end()
    if (job.price > profile.balance) return res.status(402).end()

    await sequelize.transaction(transaction => {
        return Promise.all([
            Profile.update(
                { balance: Sequelize.literal(`balance - ${job.price}`) },
                { where: { id: profile.id } },
                { transaction },
            ),
            Profile.update(
                { balance: Sequelize.literal(`balance + ${job.price}`) },
                { where: { id: ContractorId } },
                { transaction },
            ),
            Job.update(
                {
                    paid: true,
                    paymentDate: new Date().toISOString(),
                },
                { where: { id } },
                { transaction },
            ),
        ])
    })

    res.status(200).end()
})

/**
 * @allows deposits to be made in a client's balance
 */
app.post('/balances/deposit/:id', async (req, res) => {
    const {Profile,Contract,Job} = req.app.get('models')
    const {id} = req.params
    const {deposit} = req.body

    const profile = await Profile.findOne({ where: { id } })
    if (profile.type === 'contractor') return res.status(405).end()

    const contracts = await Contract.findAll({
        where: {
            ClientId: id,
        },
        attributes: [],
        include: {
            model: Job,
            where: {
                paid: null,
            },
        },
    })
    if (!contracts.length) return res.status(406).end()

    const pending = contracts
        .flatMap(c => c.Jobs)
        .map(j => j.price)
        .reduce((a,b) => a+b, 0)
    if (deposit > pending/4) return res.status(406).end()

    profile.balance += deposit
    await profile.save()

    res.status(200).end()
})

/**
 * @returns best profession based on earnings
 * within a given date range
 */
app.get('/admin/best-profession', async (req, res) => {
    const {Profile,Contract,Job} = req.app.get('models')
    const {start,end} = req.query
    const startISO = `${start}T00:00:00.000Z`
    const endISO = `${end}T23:59:59.999Z`

    let jobs = await Job.findAll({
        attributes: ['price'],
        where: {
            paymentDate: {
                [Op.gte]: startISO,
                [Op.lte]: endISO,
            },
        },
        include: {
            model: Contract,
            attributes: ['ContractorId'],
            include: {
                model: Profile,
                as: 'Contractor',
                attributes: ['profession'],
            }
        },
    })
    if (!jobs.length) return res.status(404).end()


    let earnings = []
    jobs.forEach(job => {
        let amount = job.price
        let profession = job.Contract.Contractor.profession

        let index = earnings.findIndex(earning => earning.profession === profession)
        if (index < 0) {
            earnings.push({
                profession,
                amount,
            })
            return
        }
        earnings[index].amount += amount
    })
    let sortedEarnings = earnings.sort(byAmount)
    
    console.log(sortedEarnings)
    res.send(sortedEarnings[0].profession)
})

/**
 * @returns best client based on payments done
 * within a given date range
 */
app.get('/admin/best-clients', async (req, res) => {
    const {Profile,Contract,Job} = req.app.get('models')
    let {start,end,limit} = req.query
    limit = limit || 2
    const startISO = `${start}T00:00:00.000Z`
    const endISO = `${end}T23:59:59.999Z`

    let jobs = await Job.findAll({
        attributes: ['price'],
        where: {
            paymentDate: {
                [Op.gte]: startISO,
                [Op.lte]: endISO,
            },
        },
        include: {
            model: Contract,
            attributes: ['ClientId'],
            include: {
                model: Profile,
                as: 'Client',
            }
        },
    })
    if (!jobs.length) return res.status(404).end()

    let paidAmounts = []
    jobs.forEach(job => {
        let amount = job.price
        let {Client} = job.Contract

        let index = paidAmounts.findIndex(paid => paid.client.id === Client.id)
        if (index < 0) {
            paidAmounts.push({
                client: Client,
                amount,
            })
            return
        }
        paidAmounts[index].amount += amount
    })
    let sortedPaidAmounts = paidAmounts
        .sort(byAmount)
        .map(paidAmount => {
            return {
                ...paidAmount.client.dataValues,
                paid: paidAmount.amount,
            }
        })

    res.json(sortedPaidAmounts.splice(0, limit))
})

module.exports = app
