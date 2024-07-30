import Mustache from 'mustache';

const view = {
    title: 'Joe',
    calc: function() {
        return 2 + 4;
    }
}

const template = `
    <h1>{{title}}</h1>
    <p>{{calc}}</p>
`

export const output = Mustache.render(template, view);