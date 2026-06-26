{
	"patcher" : 	{
		"fileversion" : 1,
		"appversion" : 		{
			"major" : 8,
			"minor" : 5,
			"revision" : 5,
			"architecture" : "x64",
			"modernui" : 1
		},
		"classnamespace" : "box",
		"rect" : [ 60.0, 104.0, 560.0, 420.0 ],
		"boxes" : [
			{
				"box" : 				{
					"id" : "obj-info",
					"maxclass" : "comment",
					"text" : "maestra.entity <slug>  —  arg #1 is the entity slug. In: dict/message to send. Out: state dict, changed keys, slug.",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 12.0, 8.0, 536.0, 20.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "in-1",
					"maxclass" : "inlet",
					"numinlets" : 0,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"comment" : "state update (dict) to send",
					"patching_rect" : [ 360.0, 40.0, 30.0, 30.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-1",
					"maxclass" : "newobj",
					"text" : "udpreceive 57121",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 12.0, 44.0, 120.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-2",
					"maxclass" : "newobj",
					"text" : "oscparse",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 12.0, 80.0, 120.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-3",
					"maxclass" : "newobj",
					"text" : "route /maestra/entity/state",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 12.0, 116.0, 170.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-4",
					"maxclass" : "newobj",
					"text" : "js parse-state.js",
					"numinlets" : 1,
					"numoutlets" : 3,
					"outlettype" : [ "", "", "" ],
					"patching_rect" : [ 12.0, 152.0, 120.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-5",
					"maxclass" : "newobj",
					"text" : "sel #1",
					"numinlets" : 2,
					"numoutlets" : 2,
					"outlettype" : [ "bang", "" ],
					"patching_rect" : [ 12.0, 188.0, 60.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-6",
					"maxclass" : "newobj",
					"text" : "gate",
					"numinlets" : 2,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 92.0, 224.0, 60.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-send",
					"maxclass" : "newobj",
					"text" : "prepend /maestra/entity/state/update/#1",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 300.0, 84.0, 250.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-fmt",
					"maxclass" : "newobj",
					"text" : "oscformat",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 300.0, 120.0, 120.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-out",
					"maxclass" : "newobj",
					"text" : "udpsend localhost 57120",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 300.0, 156.0, 170.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "out-1",
					"maxclass" : "outlet",
					"numinlets" : 1,
					"numoutlets" : 0,
					"comment" : "current state (dict)",
					"patching_rect" : [ 92.0, 300.0, 30.0, 30.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "out-2",
					"maxclass" : "outlet",
					"numinlets" : 1,
					"numoutlets" : 0,
					"comment" : "changed keys (list)",
					"patching_rect" : [ 160.0, 300.0, 30.0, 30.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "out-3",
					"maxclass" : "outlet",
					"numinlets" : 1,
					"numoutlets" : 0,
					"comment" : "slug (symbol)",
					"patching_rect" : [ 12.0, 300.0, 30.0, 30.0 ]
				}
			}
		],
		"lines" : [
			{ "patchline" : { "source" : [ "obj-1", 0 ], "destination" : [ "obj-2", 0 ] } },
			{ "patchline" : { "source" : [ "obj-2", 0 ], "destination" : [ "obj-3", 0 ] } },
			{ "patchline" : { "source" : [ "obj-3", 0 ], "destination" : [ "obj-4", 0 ] } },
			{ "patchline" : { "source" : [ "obj-4", 0 ], "destination" : [ "obj-5", 0 ] } },
			{ "patchline" : { "source" : [ "obj-4", 0 ], "destination" : [ "out-3", 0 ] } },
			{ "patchline" : { "source" : [ "obj-4", 1 ], "destination" : [ "obj-6", 1 ] } },
			{ "patchline" : { "source" : [ "obj-4", 2 ], "destination" : [ "out-2", 0 ] } },
			{ "patchline" : { "source" : [ "obj-5", 0 ], "destination" : [ "obj-6", 0 ] } },
			{ "patchline" : { "source" : [ "obj-6", 0 ], "destination" : [ "out-1", 0 ] } },
			{ "patchline" : { "source" : [ "in-1", 0 ], "destination" : [ "obj-send", 0 ] } },
			{ "patchline" : { "source" : [ "obj-send", 0 ], "destination" : [ "obj-fmt", 0 ] } },
			{ "patchline" : { "source" : [ "obj-fmt", 0 ], "destination" : [ "obj-out", 0 ] } }
		]
	}
}
